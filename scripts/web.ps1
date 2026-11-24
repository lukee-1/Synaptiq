param([ValidateSet('dev', 'build', 'start', 'check')][string]$Action = 'dev')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = Join-Path $taskRoot 'node_modules/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Run npm ci in the repository root to install its Node 24 runtime.' }
$env:PATH = (Split-Path -Parent $taskNode) + ';' + $env:PATH
Push-Location (Join-Path $taskRoot 'frontend')
try {
    if ($Action -eq 'check') {
        & $taskNode node_modules/typescript/bin/tsc --noEmit
        if ($LASTEXITCODE -ne 0) { throw 'Type check failed' }
        & $taskNode node_modules/eslint/bin/eslint.js .
        if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
        & $taskNode node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1 --no-file-parallelism
    } elseif ($Action -eq 'build') {
        & $taskNode node_modules/next/dist/bin/next build
    } else {
        & $taskNode node_modules/next/dist/bin/next $Action --hostname 127.0.0.1
    }
    if ($LASTEXITCODE -ne 0) { throw "Frontend $Action failed" }
} finally { Pop-Location }
