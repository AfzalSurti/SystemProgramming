// why we writting this?

const express = require('express');
const nodemailer = require('nodemailer');
const fs=require('fs');
const path = require("path");

const app=express();
app.use(express.json()); // for parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // serve static files from 'public' directory

const ROOT=path.join(__dirname,"..");
const STATS_PATH=path.join(ROOT,"stats.json");
const EVENTS_PATH=path.join(ROOT,"events.jsonl");
const INCIDENTS_PATH=path.join(ROOT,"incidents.json");
const ALERTS_PATH=path.join(ROOT,"alerts.jsonl");
const SAMPLE_LIMIT=0; // 0 = no limit (show all samples in the UI)
const EMAIL_FROM=process.env.ALERT_EMAIL_FROM ;
const EMAIL_TO=process.env.ALERT_EMAIL_TO;
const EMAIL_PASS=process.env.ALERT_EMAIL_PASS;
let lastAlertTs = 0; // remember last sent alert timestamp to avoid duplicates

const GEMINI_API_KEY=process.env.GEMINI_API_KEY;
const GEMINI_MODEL=process.env.GEMINI_MODEL || "gemini-1.5-pro";

async function buildEmailWithGemini(alert){
    // build email body using Gemini API
    const prompt=`you are an SRE assisatnt. Write a short email about this  alert.
    Alert:
    - Type: ${alert.type}
    - Prev: ${alert.prev}
    -Now: ${alert.now}
    -Time (epoch): ${alert.ts}

    Requirements:
    - 1 subject line (plain text)
    - 1 short email body (3-6 lines)
    - Use clear, professional tone
    - Include suggested next action
    return JSON: {"subject":"..","body":"...}
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

const mailer=nodemailer.createTransport({ // configure nodemailer transporter
    service:"gmail",
    auth:{
        user:EMAIL_FROM,
        pass:EMAIL_PASS,
    },
});

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
        const alerts=readJsonSafe(ALERTS_PATH); // read all alerts
        if(!alerts.length) return;//   no alerts

        const latest = alerts[alerts.length-1]; // get the latest alert
        if(!latest || !latest.ts) return ; // invalid alert

        if(latest.ts<=latestAlertTs) return ; // already sent this alert

        latestAlertTs=latest.ts; // update last sent alert timestamp

        // send email

        const subject=`[ALERT] ${latest.type || "ALERT"} (${latest.now})`; // email subject
        // let use here the gemini api to form a better email body    
        const body=`
        Time: ${new Date(latest.ts * 1000).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}
        Type:${latest.type}
        Prev:${latest.prev}
        Now:${latest.now}
        `.trim();

        const gem=await buildEmailWithGemini(latest);
        if(gem?.subject) subject=gem.subject;
        if(gem?.body) body=gem.body;
        
    }catch{
        // ignore errors
    }
},2000); // keep the process alive

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
