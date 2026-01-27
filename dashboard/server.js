// why we writting this?

const express = require('express');
const fs=require('fs');
const path = require("path");

const app=express();
app.use(express.json()); // for parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // serve static files from 'public' directory


function readJson(filePath,fallback){ // read json file with fallback
    try{
        return JSON.parse(fs.readFileSync(filePath,'utf8'));
    }catch{
        return fallback; // return fallback on error - what is a fallback? - default value
    }
}

app.get("/api/stats",(req,res) => { // endpoint to get stats
    const stats=readJson(path.join(__dirname,"..","stats.json"),{}); // read stats.json or return empty object
    res.json(stats);
});

app.get("/api/incidents",(req,res)=>{
    const incidents=readJson(path.join(__dirname,"..","incidents.json"),[]); // read incidents.json or return empty array
    res.json(incidents);
});

app.listen(4000,()=>{
    console.log("Server running on http://localhost:4000");
});