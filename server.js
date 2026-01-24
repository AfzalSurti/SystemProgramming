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
    if(Math.random()>0.5){ // simulate a login success or failure randomly because of the random number -  we do because we have to check for all use cases
        log(`${req.ip} GET /login 500`); // log a failed login attempt
        res.sendStatus(500).send("Server Error"); // send a server error response
    }
    else{
        log(`${req.ip} GET /login 200`); // log a successful login attempt
        res.send("Login Successful"); // send a success response
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