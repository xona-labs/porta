-- Privy email login. Users gain a Privy identity; bearer tokens move from
-- a single per-user hash to a sessions table so every login can issue a
-- fresh session without invalidating others.

ALTER TABLE users ADD COLUMN privy_user_id TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX idx_users_privy ON users(privy_user_id) WHERE privy_user_id IS NOT NULL;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Carry existing API tokens forward as sessions.
INSERT INTO sessions (user_id, token_hash, created_at)
SELECT id, token_hash, created_at FROM users;
