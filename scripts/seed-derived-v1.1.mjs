import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

for (const file of ["evidence/v1.1-derived-swap-report.json", "evidence/v1.1-derived-approval-report.json"]) {
  const raw = fs.readFileSync(file, "utf8");
  const report = JSON.parse(raw);
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const values = [report.id, report.jobId, report.wallet, report.requestedInterval.startUtc, report.requestedInterval.endUtc, report.generatedAt, report.engineVersion, report.coverage.status, raw];
  const sql = `INSERT OR REPLACE INTO reports (id,job_id,wallet,start_utc,end_utc,generated_at,engine_version,coverage_status,payload) VALUES (${values.map(quote).join(",")})`;
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "pharos-audit-log-agent", "--remote", "--command", sql], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
