CREATE TABLE IF NOT EXISTS interpretations (
  repo_id TEXT PRIMARY KEY,
  summary TEXT,
  solves TEXT,
  audience TEXT,
  model TEXT,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
