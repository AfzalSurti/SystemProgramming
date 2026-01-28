const express=require("express"); // import the express module to create a web server
const fs=require("fs"); // import the file system module to handle file operations
const path=require("path"); // import the path module to handle file paths
const app=express();// create an instance of an express application

const LOG_FILE=path.join(__dirname,"server.log"); // define the path for the log file
const MAX_MB=2; // define the maximum log file size in megabytes
const MAX_BYTES=MAX_MB*1024*1024; // convert maximum size to bytes
const KEEP_FILES=5; // keep the last 5 log files

function rotateIfNeeded(){
    try{
        if(!fs.existsSync(LOG_FILE)) return; // if log file doesn't exist, no need to rotate
        const size=fs.statSync(LOG_FILE).size; // get the size of the log file

        if(size<MAX_BYTES) return; // if size is within limit, no need to rotate

        for(let i=KEEP_FILES-1;i>=1;i--){ // rotate existing log files
            const src=`${LOG_FILE}.${i}`; // source file name
            const dst=`${LOG_FILE}.${i+1}`; // destination file name
            if(fs.existsSync(src)) fs.renameSync(src,dst); // rename source to destination if it exists

        }
        // server.log -> server.log.1
        fs.renameSync(LOG_FILE,`${LOG_FILE}.1`); // rename current log file to log.1

    }catch{

    }
}

function log(line){
    rotateIfNeeded(); // check if rotation is needed before logging
    fs.appendFileSync(LOG_FILE,data+"\n"); // append the log data to the log file
}

app.use((req,res,next)=>{
    const start=process.hrtime.bigint(); // record start time

    res.on("finish",()=>{
        const end=process.hrtime.bigint(); // record end time

        const ms=Number(end-start)/1e6; // calculate duration in milliseconds

        const ts=new Date().toLocalString("en-IN",{timeZone:"Asia/Kolkata"}); // get timestamp in specific timezone

        log(`[${ts}] ${req.ip} ${req.method} ${req.path} ${req.statusCode} ${ms.toFixed(2)}`); // log the request details
    });
    next(); // proceed to the next middleware or route handler
});



app.get("/",(req,res)=>{ // define a route for the root URL
         res.send("Hello, World!"); // send a response to the client
});

app.get("/login",(req,res)=>{
    try{
        if(Math.random()<0.5){
            throw new Error("Random login failure"); // simulate a random error
        }
        res.send("Login Successful"); // send a success response

    }catch(err){

        res.status(500).send("Server Error"); // send a server error response
        fs.appendFileSync("errors.log",err.stack+"\n\n"); // append the error stack trace to errors.log file
    }
});

app.use((req,res)=>{
    res.status(404).send("Not Found"); // send a 404 not found response
});

app.listen(3000,()=>{
    console.log("Server is running on port 3000"); // log a message indicating the server is running
    console.log("http://localhost:3000"); // log the URL to access the server
}); // start the server and listen on port 3000