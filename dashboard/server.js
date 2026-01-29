// why we writting this?

const express = require('express');
const nodemailer = require('nodemailer');
const fs=require('fs');
const path = require("path");

try { // optional .env loading if dotenv is installed
    require("dotenv").config();
} catch {}

const app=express();
app.use(express.json()); // for parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // serve static files from 'public' directory

const ROOT=path.join(__dirname,"..");
const STATS_PATH=path.join(ROOT,"stats.json");
const EVENTS_PATH=path.join(ROOT,"events.jsonl");
const INCIDENTS_PATH=path.join(ROOT,"incidents.json");
const ALERTS_PATH=path.join(ROOT,"alerts.jsonl");
const SAMPLE_LIMIT=0; // 0 = no limit (show all samples in the UI)
const EMAIL_FROM=process.env.ALERT_EMAIL_FROM;
const EMAIL_TO=process.env.ALERT_EMAIL_TO;
const EMAIL_PASS=process.env.ALERT_EMAIL_PASS;
let lastAlertTs = 0; // remember last sent alert timestamp to avoid duplicates
let lastGeminiTs=0; // last time we used gemini api
const GEMINI_COOLDOWN_MS=5*60*1000; // 5 minutes cooldown between gemini api calls

let lastEmailStatus={
    ts:null,
    subject:null,
    to:null,
    ok:false,
    error:null
};


const GEMINI_API_KEY=process.env.GEMINI_API_KEY;
const GEMINI_MODEL=process.env.GEMINI_MODEL || "gemini-1.5-pro";

async function buildEmailWithGemini(alert,incidents){
    // build email body using Gemini API
    if(!GEMINI_API_KEY) return null;

    const incidentText=(incidents || []).slice(0,5).map((i,idx)=>{
        return `${idx+1}) ${i.path} | ${i.status} | count=${i.count} | lastSeen=${i.lastSeen}`;
    }).join("\n");

    const prompt=`You are an SRE assistant. Write a short email about this alert.
    Alert:
    - Type: ${alert.type}
    - Prev: ${alert.prev}
    - Now: ${alert.now}
    - Time (epoch): ${alert.ts}

    Recent incidents (top 5):
    ${incidentText || "None"}

    Requirements:
    - 1 subject line (plain text)
    - 1 short email body (3-6 lines)
    - Use clear, professional tone
    - Include suggested next action
    Return JSON: {"subject":"...","body":"..."}
    `.trim();

    const res=await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                contents:[{role:"user",parts:[{text: prompt}]}]
            })
        }
    );
    
const data=await res.json();
    const text=data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try{
        return JSON.parse(text);
    }catch{
        return null;
    }

}

function buildHtmlEmail({ subject, body, meta }){ // simple HTML email wrapper
    const safe = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const lines = safe(body).split(/\r?\n/).map(l => `<p style="margin:0 0 8px 0;">${l}</p>`).join("");
    const metaHtml = meta ? `<div style="margin-top:10px; font-size:12px; color:#6b7280;">${safe(meta)}</div>` : "";
    return `
<!DOCTYPE html>
<html>
  <body style="font-family:Segoe UI, Arial, sans-serif; background:#0b1220; color:#e6eefc; padding:20px;">
    <div style="max-width:640px; margin:0 auto; background:#0f1b33; border:1px solid #1e2a44; border-radius:12px; padding:16px;">
      <h2 style="margin:0 0 10px 0; font-size:18px;">${safe(subject)}</h2>
      ${lines}
      ${metaHtml}
    </div>
  </body>
</html>
    `.trim();
}

const mailer=(EMAIL_FROM && EMAIL_PASS)
    ? nodemailer.createTransport({ // configure nodemailer transporter
        service:"gmail",
        auth:{
            user:EMAIL_FROM,
            pass:EMAIL_PASS,
        },
    })
    : null;

function readJsonSafe(filePath,fallback){ // read json file with fallback
    try{
        return JSON.parse(fs.readFileSync(filePath,'utf8'));
    }catch{
        return fallback; // return fallback on error - what is a fallback? - default value
    }
}

function readJsonlSafe(filePath){ // read jsonl file safely
    if(!fs.existsSync(filePath)) return [];
    const lines=fs.readFileSync(filePath,"utf-8").split("\n").filter(Boolean);

    const out=[];
    for(const line of lines){ // if i right in instead of "of" -  what change happened? -
        try{
            out.push(JSON.parse(line));
        }catch{

        }
    }
    return out;
}

function buildIncidents(events){
    const map=new Map();

    for(const e of events){
        if(!e || !e.path || !e.status) continue;

        if(e.path==="/favicon.ico") continue;

        const key=`${e.path}|${e.status}`;

        if(!map.has(key)){
            map.set(key,{
                key,
                path:e.path,
                status:e.status,
                count:0,
                lastSeen:e.ts,
                samples:[],
            });
        }

        const inc=map.get(key);
        inc.count+=1;
        inc.lastSeen=e.ts;

        const sample=String(e.raw || "").replace(/\r?\n/g,"");

        // keep all samples unless a limit is set
        if(SAMPLE_LIMIT===0 || inc.samples.length < SAMPLE_LIMIT) inc.samples.push(sample);

    }
    return [...map.values()].sort((a,b) => (b.count ?? 0) - (a.count ?? 0));
}

// auto - regrouped evry 2 seconds - means it fetch record for incidents.json every 2 seconds 
// my moto is a one complet website was there 1- testing one - 1 for  dashbard 
setInterval(()=>{ // regroup incidents every 2 seconds
    try{
        const events=readJsonlSafe(EVENTS_PATH);
        const incidents=buildIncidents(events);
        fs.writeFileSync(INCIDENTS_PATH,JSON.stringify(incidents,null,2));


    }catch{

    }
},2000);

setInterval(async ()=>{ // check for new alerts every 2 seconds
    try{
        const alerts=readJsonlSafe(ALERTS_PATH); // read all alerts
        if(!alerts.length) return;//   no alerts

        const latest = alerts[alerts.length-1]; // get the latest alert
        if(!latest || !latest.ts) return ; // invalid alert

        if(latest.ts<=lastAlertTs) return ; // already sent this alert

        lastAlertTs=latest.ts; // update last sent alert timestamp

        // send email
        const now=Date.now();
        let subject=`[ALERT] ${latest.type || "ALERT"} (${latest.now})`; // email subject
        // let use here the gemini api to form a better email body    
        let body=`
        Time: ${new Date(latest.ts * 1000).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}
        Type:${latest.type}
        Prev:${latest.prev}
        Now:${latest.now}
        `.trim();

        const incidents=readJsonSafe(INCIDENTS_PATH,[]); // read current incidents
        if(now-lastGeminiTs > GEMINI_COOLDOWN_MS){
            const gem=await buildEmailWithGemini(latest,incidents);
            if(gem?.subject) subject=gem.subject;
            if(gem?.body) body=gem.body;
            lastGeminiTs=now;
        }

        try{
            if(!mailer || !EMAIL_TO){
                throw new Error("Email config missing (ALERT_EMAIL_FROM/ALERT_EMAIL_TO/ALERT_EMAIL_PASS)");
            }

            const html = buildHtmlEmail({
                subject,
                body,
                meta: `Alert type: ${latest.type || "-"} | Prev: ${latest.prev ?? "-"} | Now: ${latest.now ?? "-"}`
            });

            await mailer.sendMail({from:EMAIL_FROM,to:EMAIL_TO,subject, text:body, html});

            lastEmailStatus={
                ts:Date.now(),
                subject,
                to:EMAIL_TO,
                ok:true,
                error:null
            };
        }catch(err){
            lastEmailStatus={
                ts:Date.now(),
                subject,
                to:EMAIL_TO,
                ok:false,
                error:String(err?.message || err)
            };
        }
        
    }catch{
        // ignore errors
    }
},2000); // keep the process alive

app.get("/api/email-status", (req,res)=>{
  res.json(lastEmailStatus);
});

app.get("/api/email-test", async (req,res)=>{ // send a test email
    try{
        if(!mailer || !EMAIL_TO){
            return res.status(400).json({ok:false, error:"Email config missing"});
        }
        const subject = "[TEST] Log Monitor Email";
        const body = "This is a test email from Log Monitor. If you received this, SMTP is working.";
        const html = buildHtmlEmail({ subject, body, meta: "Test email endpoint" });
        await mailer.sendMail({from:EMAIL_FROM,to:EMAIL_TO,subject, text:body, html});
        lastEmailStatus = { ts:Date.now(), subject, to:EMAIL_TO, ok:true, error:null };
        res.json({ok:true});
    }catch(err){
        lastEmailStatus = { ts:Date.now(), subject:null, to:EMAIL_TO, ok:false, error:String(err?.message || err) };
        res.status(500).json({ok:false, error:lastEmailStatus.error});
    }
});

app.post("/api/email-summary", async (req,res)=>{ // send summary email on demand
    try{
        const { period, to, alertsN, incidentsN } = req.body || {};
        if(!to) return res.status(400).json({ ok:false, error:"Email is required" });
        if(!["daily","weekly","monthly"].includes(period)) {
            return res.status(400).json({ ok:false, error:"Invalid period" });
        }
        if(!mailer || !EMAIL_FROM) {
            return res.status(400).json({ ok:false, error:"Email sender not configured" });
        }

        const now = Date.now();
        let sinceMs = 24*60*60*1000;
        if(period === "weekly") sinceMs = 7*24*60*60*1000;
        if(period === "monthly") sinceMs = 30*24*60*60*1000;
        const sinceEpoch = Math.floor((now - sinceMs) / 1000);

        const alertsAll = readJsonlSafe(ALERTS_PATH).filter(a => (a.ts ?? 0) >= sinceEpoch);
        const incidentsAll = readJsonSafe(INCIDENTS_PATH, []);
        const stats = readJsonSafe(STATS_PATH, {});

        const limitAlerts = Math.max(1, Math.min(100, Number(alertsN || 5)));
        const limitIncidents = Math.max(1, Math.min(100, Number(incidentsN || 5)));

        const alerts = alertsAll.slice(-limitAlerts);
        const incidents = incidentsAll.slice(0, limitIncidents);

        let subject = `[SUMMARY] ${period.toUpperCase()} Log Summary`;
        let body = `
Period: ${period}
From: ${new Date(now - sinceMs).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}
To: ${new Date(now).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}

Stats:
Total: ${stats.total ?? 0}
4xx: ${stats.error4xx ?? 0} | 404: ${stats.error404 ?? 0}
5xx: ${stats.error5xx ?? 0} | 500: ${stats.error500 ?? 0}
Avg: ${stats.avg_latency_ms ?? 0} ms
P95: ${stats.p95_latency_ms ?? 0} ms

Incidents (top ${limitIncidents}):
${(incidents||[]).map(i=>`${i.path} ${i.status} count=${i.count} lastSeen=${i.lastSeen}`).join("\n")}

Alerts (last ${limitAlerts}):
${(alerts||[]).map(a=>`${a.type} prev=${a.prev} now=${a.now}`).join("\n")}
        `.trim();

        if (GEMINI_API_KEY) {
            const prompt = `
You are an SRE assistant. Create a ${period} summary email for this system.
Use the data below and return JSON {"subject":"...","body":"..."}.

${body}
            `.trim();

            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ role:"user", parts:[{ text: prompt }] }] })
                }
            );

            const d = await r.json();
            const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            try{
                const parsed = JSON.parse(t);
                if(parsed?.subject) subject = parsed.subject;
                if(parsed?.body) body = parsed.body;
            }catch{}
        }

        const html = buildHtmlEmail({ subject, body, meta: `Summary period: ${period}` });

        await mailer.sendMail({ from: EMAIL_FROM, to, subject, text: body, html });

        lastEmailStatus = { ts: Date.now(), subject, to, ok: true, error: null };
        return res.json({ ok:true });
    }catch(err){
        lastEmailStatus = { ts: Date.now(), subject: null, to: req.body?.to, ok: false, error: String(err?.message || err) };
        return res.status(500).json({ ok:false, error: lastEmailStatus.error });
    }
});

app.get("/api/stats",(req,res) => { // endpoint to get stats
    res.json(readJsonSafe(STATS_PATH,{}));
});

app.get("/api/incidents",(req,res)=>{
    if(!fs.existsSync(INCIDENTS_PATH)){
        const events=readJsonlSafe(EVENTS_PATH);
        return res.json(buildIncidents(events));
    }
    res.json(readJsonSafe(INCIDENTS_PATH,[]));
});

app.get("/api/alerts",(req,res)=>{ // endpoint to get alerts from alerts.jsonl
    res.json(readJsonlSafe(ALERTS_PATH));
});

app.listen(4000,()=>{
    console.log("Server running on http://localhost:4000");
    console.log("ROOT:",ROOT);
    console.log("stats.json exists:",fs.existsSync(STATS_PATH));
    console.log("events.jsonl exists",fs.existsSync(EVENTS_PATH));
});
