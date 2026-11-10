CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  html_url TEXT NOT NULL,
  description_en TEXT,
  language TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_entries (
  board TEXT NOT NULL,
  date TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  stars INTEGER,
  forks INTEGER,
  gained INTEGER,
  featured INTEGER,
  language TEXT,
  tags TEXT NOT NULL,
  PRIMARY KEY (board, date, repo_id),
  FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
