# System Programming Example - Log Monitor + Dashboard

End-to-end demo that:
1) serves a small Express app that writes logs,
2) parses those logs with a C monitor,
3) renders a live dashboard from the generated stats.

This repo is organized as a simple "pipeline" so you can understand how logs
turn into metrics and incidents, then into a UI.

## Architecture (high level)

Request -> Root Express app -> `server.log` (and `errors.log` for failures)
        -> C monitor (`monitor_advanced.exe`) -> `stats.json`, `events.jsonl`, `report.csv`
        -> Dashboard server -> `incidents.json` -> Browser UI

## Features

- Root Express server with `/` and `/login` endpoints and simulated errors.
- C log monitor that:
  - counts total requests and errors,
  - tracks unique IPs,
  - emits JSON stats and JSONL event stream,
  - exports a CSV summary.
- Dashboard server that groups events into "incidents".
- Live UI with filtering, sorting, and incident details.

## Requirements

- Windows (monitor uses Windows threading and `Sleep`)
- Node.js (LTS recommended)
- `gcc` (MinGW or similar) to build `monitor_advanced.c`

## Setup

Install Node dependencies (only at the repo root):

```powershell
npm install
```

## Run (one command)

From the repo root:

```powershell
.\run-all.ps1
```

This does:
1) `node server.js` in the repo root
2) `gcc monitor_advanced.c -o monitor_advanced.exe`
3) `.\monitor_advanced.exe`
4) `node server.js` inside `dashboard`

Stop everything with Ctrl+C in each of the opened windows.

## Run (manual)

Open three terminals:

```powershell
# 1) Root server
node server.js
```

```powershell
# 2) Build and run monitor
gcc monitor_advanced.c -o monitor_advanced.exe
.\monitor_advanced.exe
```

```powershell
# 3) Dashboard server
cd dashboard
node server.js
```

## URLs

- Root app: http://localhost:3000
  - `GET /` -> "Hello, World!"
  - `GET /login` -> random 200 or 500
- Dashboard: http://localhost:4000
  - `GET /api/stats`
  - `GET /api/incidents`

## Output files

All output files are written in the repo root:

- `server.log` - request log written by the root server
- `errors.log` - error stack traces for failed `/login`
- `events.jsonl` - JSONL event stream produced by the C monitor
- `stats.json` - live aggregate metrics (total, 404, 500, timestamp)
- `incidents.json` - grouped incidents built by the dashboard server
- `report.csv` - CSV of unique IPs and counts

## Data formats (summary)

- `server.log` lines look like:
  - `[timestamp] IP METHOD PATH STATUS`
- `events.jsonl` lines look like:
  - `{"ts":"...","ip":"...","method":"...","path":"...","status":500,"raw":"..."}`
- `stats.json`:
  - `{ "total": 10, "error404": 2, "error500": 1, "timestamp": "..." }`

## Project layout

- `server.js` - root Express server (writes `server.log`)
- `monitor_advanced.c` - C log monitor
- `dashboard/server.js` - dashboard API + incident grouping
- `dashboard/public/` - static UI assets
- `run-all.ps1` - one-command launcher

## Configuration notes

- Ports: root server `3000`, dashboard server `4000`
- Dashboard refresh/incident rebuild: every 2 seconds
- Log timestamp (root server): IST (Asia/Kolkata)
- Monitor stats timestamp: local time; event timestamp: UTC

## Troubleshooting

- PowerShell blocks script:
  - `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- `gcc` not found:
  - install MinGW or another GCC distribution and ensure it is on PATH
- Dashboard shows no data:
  - make sure `monitor_advanced.exe` is running and `server.log` is growing

## Production notes / limitations

This is a learning project and is not production-ready. Known gaps:

- Log parsing is format-dependent
- File-based storage does not scale
- No retention policy or log rotation
- No alerting (email/Slack/etc.)
- Unbounded thread creation in the monitor
- No authentication on the dashboard
- No latency or percentile metrics

## Next steps (ideas)

- Move logs to a queue (Kafka/Redis) and metrics to a database
- Add auth + role-based access to the dashboard
- Implement bounded worker pool in the monitor
- Add alerting and retention policies

