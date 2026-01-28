# Folder where this script lives (project root).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
# Path to the dashboard folder.
$dashboard = Join-Path $root "dashboard"

# 1) Start the root Node server in its own window.
Write-Host "Starting root server..."
Start-Process -WorkingDirectory $root -FilePath "node" -ArgumentList "server.js" -WindowStyle Normal
# Give it a second to boot before starting the next process.
Start-Sleep -Seconds 1

# 2) Build the monitor with gcc.
$monitorExe = Join-Path $root "monitor_advanced.exe"
$gcc = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $gcc) {
    Write-Error "gcc is not available. Install gcc to build monitor_advanced.exe."
    exit 1
}

Write-Host "Building monitor_advanced.exe with gcc..."
& gcc "monitor_advanced.c" -o "monitor_advanced.exe"
if ($LASTEXITCODE -ne 0) {
    Write-Error "gcc build failed."
    exit 1
}

# 3) Start the compiled monitor in its own window.
Write-Host "Starting monitor_advanced..."
Start-Process -WorkingDirectory $root -FilePath ".\\monitor_advanced.exe" -WindowStyle Normal
Start-Sleep -Seconds 1

# 4) Start the dashboard Node server in its own window.
Write-Host "Starting dashboard server..."
Start-Process -WorkingDirectory $dashboard -FilePath "node" -ArgumentList "server.js" -WindowStyle Normal

Write-Host "All processes started. Use the opened windows to stop them with Ctrl+C."
