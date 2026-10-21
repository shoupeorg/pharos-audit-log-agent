CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  wallet TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  progress INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_updated_at ON jobs(updated_at DESC);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  wallet TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_generated_at ON reports(generated_at DESC);
