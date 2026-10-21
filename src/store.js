export async function saveJob(db, state, requestKey) {
  const now = state.updatedAt || new Date().toISOString(), payload = JSON.stringify(state);
  await db.prepare(`INSERT INTO jobs (id,request_key,wallet,start_utc,end_utc,status,phase,progress,created_at,updated_at,engine_version,payload)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,phase=excluded.phase,progress=excluded.progress,updated_at=excluded.updated_at,payload=excluded.payload`)
    .bind(state.jobId, requestKey, state.wallet, state.range.startUtc, state.range.endUtc, state.status, state.phase, state.progress, state.createdAt, now, state.engineVersion, payload).run();
  return state;
}
export async function getJob(db, id) { const row = await db.prepare("SELECT payload,request_key FROM jobs WHERE id=?").bind(id).first(); return row ? { state: JSON.parse(row.payload), requestKey: row.request_key } : null; }
export async function getJobByKey(db, key) { const row = await db.prepare("SELECT payload FROM jobs WHERE request_key=?").bind(key).first(); return row ? JSON.parse(row.payload) : null; }
export async function saveReport(db, report) {
  await db.prepare(`INSERT OR REPLACE INTO reports (id,job_id,wallet,start_utc,end_utc,generated_at,engine_version,coverage_status,payload) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(report.id, report.jobId, report.wallet, report.requestedInterval.startUtc, report.requestedInterval.endUtc, report.generatedAt, report.engineVersion, report.coverage.status, JSON.stringify(report)).run();
}
export async function getReport(db, id) { const row = await db.prepare("SELECT payload FROM reports WHERE id=?").bind(id).first(); return row ? JSON.parse(row.payload) : null; }
export async function listReports(db) { const rows = await db.prepare("SELECT id,wallet,start_utc,end_utc,generated_at,engine_version,coverage_status FROM reports ORDER BY generated_at DESC LIMIT 30").all(); return rows.results; }
