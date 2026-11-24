param([switch]$ModelOnly)
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '../backend/.runtime'
if (-not $ModelOnly) { $release = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b12589' }
function Get-VerifiedFile($Url, $Path, $Hash) {
    if ((Test-Path -LiteralPath $Path) -and ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Hash)) { return }
    Write-Output "Downloading $([IO.Path]::GetFileName($Path))"
    & curl.exe --location --fail --silent --show-error --retry 3 --connect-timeout 30 --max-time 1800 --continue-at - --output $Path $Url
    if ($LASTEXITCODE -ne 0) { throw "Download did not complete; rerun to resume" }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Hash) { throw 'Download checksum mismatch' }
    Write-Output 'Checksum verified'
}
if (-not $ModelOnly) { foreach ($name in @('llama-b12589-bin-win-cpu-x64.zip')) {
    $asset = $release.assets | Where-Object name -eq $name
    $archive = Join-Path $runtime $name
    Get-VerifiedFile $asset.browser_download_url $archive $asset.digest.Replace('sha256:', '')
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtime 'llama') -Force
}
}
$model = Invoke-RestMethod 'https://huggingface.co/api/models/unsloth/Qwen3.5-4B-GGUF?blobs=true'
$name = 'Qwen3.5-4B-UD-Q4_K_XL.gguf'
$file = $model.siblings | Where-Object rfilename -eq $name
Get-VerifiedFile "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/$($model.sha)/$name" (Join-Path $runtime $name) $file.lfs.sha256
Write-Output 'Local model runtime ready'
