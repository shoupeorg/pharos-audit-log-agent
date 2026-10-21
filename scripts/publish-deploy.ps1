$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$env:PATH = "C:\Program Files\Git\bin;C:\Program Files\Git\cmd;$env:PATH"

Write-Host "==> Publish existing verified commits"
git -c "safe.directory=$Project" push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub publication failed." }

Write-Host "==> Deploy existing built Worker"
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

Write-Host "Publication and deployment completed. No chain reads or transactions were performed."
