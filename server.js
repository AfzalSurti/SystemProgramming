const express=require("express"); // import the express module to create a web server
const fs=require("fs"); // import the file system module to handle file operations
const app=express();// create an instance of an express application

function log(data){
    const timestamp=new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) // get current timestamp in Indian Standard Time
    fs.appendFileSync("server.log",`[${timestamp}] ${data}\n`); // append timestamp and data to server.log file with a newline
}

app.get("/",(req,res)=>{ // define a route for the root URL
    log(`${req.ip} GET / 200` ); // log the request details
     res.send("Hello, World!"); // send a response to the client
});

app.get("/login",(req,res)=>{
    try{
        if(Math.random()<0.5){
            throw new Error("Random login failure"); // simulate a random error
        }
        log(`${req.ip} ${req.method} ${req.originalUrl} 200`); // log successful login attempt
        res.send("Login Successful"); // send a success response
    }catch(err){

        log(`${req.ip} ${req.method} ${req.originalUrl} 500 - ${err.message}`); // log error details
        res.status(500).send("Server Error"); // send a server error response
        fs.appendFileSync("errors.log",err.stack+"\n\n"); // append the error stack trace to errors.log file
    }
});

app.use((req,res)=>{
    log(`${req.ip} GET ${req.url} 404`); // log a 404 not found error for any undefined routes
    res.status(404).send("Not Found"); // send a 404 not found response
});

app.listen(3000,()=>{
    console.log("Server is running on port 3000"); // log a message indicating the server is running
    console.log("http://localhost:3000"); // log the URL to access the server
}); // start the server and listen on port 3000