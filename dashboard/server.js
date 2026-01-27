// why we writting this?

const express = require('express');
const fs=require('fs');
const path = require("path");

const app=express();
app.use(express.json()); // for parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // serve static files from 'public' directory

const ROOT=path.join(__dirname,"..");
const STATS_PATH=path.join(ROOT,"status.json");
const EVENTS_PATH=path.join(ROOT,"events.jsonl");
const INCIDENTS_PATH=path.join(ROOT,"incidents.json");


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

        if(inc.samples.length < 5) inc.samples.push(sample);

    }
    return [...map.values()].sort((a,b) => (b.count ?? 0) - (a.count ?? 0));
}

// auto - regrouped evry 2 seconds - means it fetch record for incidents.json every 2 seconds 
// my moto is a one complet website was there 1- testing one - 1 for  dashbard 
setInterval(()=>{
    try{
        const events=readJsonlSafe(EVENTS_PATH);
        const incidents=buildIncidents(events);
        fs.writeFileSync(INCIDENTS_PATH,JSON.stringify(incidents,null,2));


    }catch{

    }
},2000);

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

app.listen(4000,()=>{
    console.log("Server running on http://localhost:4000");
    console.log("ROOT:",ROOT);
    console.log("stats.json exists:",fs.existsSync(STATS_PATH));
    console.log("events.jsonl exists",fs.existsSync(EVENTS_PATH));
});