$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$env:PATH = "C:\Program Files\Git\bin;C:\Program Files\Git\cmd;$env:PATH"

if (git status --porcelain) { throw "Working tree is not clean." }
$Commit = (git rev-parse HEAD).Trim()
$env:COMMIT = $Commit

Write-Host "==> Push verified correction $Commit"
git -c "safe.directory=$Project" push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub publication failed." }

Write-Host "==> Deploy the already-built Worker once"
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

Write-Host "==> Persist conservative v1.1 derived reports (no chain reads)"
node.exe scripts/seed-derived-v1.1.mjs
if ($LASTEXITCODE -ne 0) { throw "Derived-report persistence failed." }

Write-Host "==> Verify public engine, derived reports, Markdown and CSV"
@'
const base = "https://pharos-audit-log-agent.shoupeorg.workers.dev";
const ids = ["b3f50f4c-0049-4d88-a694-3bec8c82c05e", "8112c09a-fdf1-4ce0-9009-786cced93ac4"];
const meta = await (await fetch(`${base}/api/meta`)).json();
if (meta.engineVersion !== "audit-log-agent/1.1.0") throw new Error(`Unexpected engine ${meta.engineVersion}`);
for (const id of ids) {
  const reportResponse = await fetch(`${base}/api/reports/${id}`);
  const markdownResponse = await fetch(`${base}/api/reports/${id}/markdown`);
  const csvResponse = await fetch(`${base}/api/reports/${id}/csv`);
  if (!reportResponse.ok || !markdownResponse.ok || !csvResponse.ok) throw new Error(`Verification failed for ${id}`);
  const report = await reportResponse.json();
  const markdown = await markdownResponse.text();
  const csv = await csvResponse.text();
  if (report.categoryTotals.gas.status !== "UNKNOWN" || !markdown.includes("Wallet-paid gas: UNKNOWN") || csv.trim().split(/\r?\n/).length - 1 !== report.activities.length) throw new Error(`Content mismatch for ${id}`);
  console.log(JSON.stringify({ id, engineVersion: report.engineVersion, swaps: report.categoryTotals.swaps.transactionCount, ambiguous: report.summary.ambiguousSwapCandidates, gas: report.categoryTotals.gas.status, csvRows: report.activities.length }));
}
console.log(JSON.stringify({ commit: process.env.COMMIT || null, deployedEngine: meta.engineVersion, verified: true }));
'@ | node.exe --input-type=module
if ($LASTEXITCODE -ne 0) { throw "Public verification failed." }

Write-Host "Correction publication, single deployment, derived-report persistence, and verification completed."
