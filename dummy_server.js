const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

// ---------------- LOG ROTATION SETTINGS ----------------
const LOG_FILE = path.join(__dirname, "server.log");
const MAX_MB = 2; // rotate when > 2 MB (change)
const MAX_BYTES = MAX_MB * 1024 * 1024;
const KEEP_FILES = 5; // keep last 5 rotated logs

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const size = fs.statSync(LOG_FILE).size;
    if (size < MAX_BYTES) return;

    // server.log.4 -> server.log.5
    for (let i = KEEP_FILES - 1; i >= 1; i--) {
      const src = `${LOG_FILE}.${i}`;
      const dst = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    }
    // server.log -> server.log.1
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    // keep server alive
  }
}

function log(line) {
  rotateIfNeeded();
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ---------------- LATENCY LOGGING MIDDLEWARE ----------------
// logs for EVERY request automatically (no need to manually call log in routes)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;

    const ts = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // FINAL LOG FORMAT:
    // [timestamp] IP METHOD PATH STATUS LATENCY_MS
    log(`[${ts}] ${req.ip} ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(2)}`);
  });

  next();
});

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.get("/login", (req, res) => {
  try {
    if (Math.random() < 0.5) throw new Error("Random login failure");
    res.send("Login Successful");
  } catch (err) {
    res.status(500).send("Server Error");
    fs.appendFileSync("errors.log", err.stack + "\n\n"); // keep stack trace here
  }
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(3000, () => {
  console.log("Dummy server running: http://localhost:3000");
});
