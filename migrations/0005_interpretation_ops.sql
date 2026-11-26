ALTER TABLE interpretations ADD COLUMN next_attempt_at TEXT;

CREATE TABLE IF NOT EXISTS interpretation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  trigger TEXT NOT NULL,
  scanned INTEGER NOT NULL,
  done INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  rate_limited INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  errors TEXT
);
