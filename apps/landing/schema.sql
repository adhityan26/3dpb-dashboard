CREATE TABLE IF NOT EXISTS waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  interest   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email, interest)
);
