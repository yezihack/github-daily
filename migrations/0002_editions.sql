CREATE TABLE IF NOT EXISTS editions (
  board TEXT NOT NULL,
  date TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (board, date)
);

INSERT OR IGNORE INTO editions (board, date, collected_at)
SELECT boards.column1, dates.date, dates.date || 'T00:00:00Z'
FROM (SELECT DISTINCT date FROM board_entries) AS dates
CROSS JOIN (
  VALUES ('daily'), ('weekly'), ('monthly'), ('yearly'), ('live-mentions'), ('github-trending')
) AS boards;
