$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $taskRoot 'backend/.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
function Start-PreviewService($Name, $Exe, $Arguments, $Directory, $Signature, $Port = 0) {
    $pidFile = Join-Path $runtime "$Name.pid"
    if (Test-Path -LiteralPath $pidFile) {
        $servicePid = [int](Get-Content -LiteralPath $pidFile)
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$servicePid"
        if ($existing -and $existing.CommandLine -like "*$Signature*") {
            Write-Output "$Name is already running"
            return
        }
    }
    if ($Port -and (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
        throw "Port $Port is occupied. Inspect its owner before starting $Name."
    }
    $process = Start-Process -FilePath $Exe -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "$Name.stdout.log") -RedirectStandardError (Join-Path $runtime "$Name.stderr.log") -PassThru
    $process.Id | Set-Content -LiteralPath $pidFile
    Write-Output "Started $Name"
}
if (-not (Test-Path -LiteralPath "$runtime/python.wasm")) { throw 'Run scripts/prepare-executor.py first.' }
if (-not (Test-Path -LiteralPath "$runtime/worker.env")) { throw 'Configure the dedicated WORKER_TOKEN as documented in docs/AI_RUNTIME.md.' }
if (-not (Test-Path -LiteralPath "$taskRoot/frontend/.next/BUILD_ID")) { throw 'Run scripts/web.ps1 -Action build first.' }
if ((Test-Path -LiteralPath "$runtime/llama/llama-server.exe") -and (Test-Path -LiteralPath "$runtime/model.key")) {
    Start-PreviewService 'inference' "$runtime/llama/llama-server.exe" @('-m','../Qwen3.5-4B-UD-Q4_K_XL.gguf','--host','127.0.0.1','--port','8001','--alias','synaptiq-local','--ctx-size','8192','--threads','4','--parallel','1','--reasoning','off','--api-key-file','../model.key') "$runtime/llama" 'llama-server' 8001
}
Start-PreviewService 'executor' "$taskRoot/backend/.venv/Scripts/python.exe" @('-m','uvicorn','executor.main:app','--host','127.0.0.1','--port','8002') "$taskRoot/backend" 'executor.main:app' 8002
Start-PreviewService 'api' "$taskRoot/backend/.venv/Scripts/python.exe" @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') "$taskRoot/backend" 'app.main:app' 8000
Start-PreviewService 'worker' "$taskRoot/backend/.venv/Scripts/python.exe" @('-m','app.workers.main') "$taskRoot/backend" 'app.workers.main'
Start-PreviewService 'web' "$taskRoot/node_modules/node/bin/node.exe" @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000') "$taskRoot/frontend" 'next' 3000
Write-Output 'Preview: http://127.0.0.1:3000/workspace'
