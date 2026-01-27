const fs = require("fs");

const EVENTS_FILE = "events.jsonl";
const OUT_FILE = "incidents.json";

if (!fs.existsSync(EVENTS_FILE)) {
  console.log("❌ events.jsonl not found. Run in correct folder.");
  process.exit(1);
}

const lines = fs.readFileSync(EVENTS_FILE, "utf8").split("\n").filter(Boolean);

let bad = 0;
const events = [];
for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch (e) {
    bad++;
  }
}

console.log(`Total lines: ${lines.length}, Parsed OK: ${events.length}, Bad: ${bad}`);

const map = new Map();

for (const e of events) {
  if (!e.path || !e.status) continue;

  if (e.path === "/favicon.ico") continue; // comment this to test

  const key = `${e.path}|${e.status}`;
  if (!map.has(key)) {
    map.set(key, { key, path: e.path, status: e.status, count: 0, lastSeen: e.ts, samples: [] });
  }

  const inc = map.get(key);
  inc.count++;
  inc.lastSeen = e.ts;

  const sample = (e.raw || "").toString().replace(/\r?\n/g, "");
  if (inc.samples.length < 5) inc.samples.push(sample);
}

const incidents = [...map.values()].sort((a, b) => b.count - a.count);
fs.writeFileSync(OUT_FILE, JSON.stringify(incidents, null, 2));

console.log(`✅ Wrote ${incidents.length} incidents to ${OUT_FILE}`);
if (incidents[0]) console.log("Top:", incidents[0]);
