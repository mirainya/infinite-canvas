-- Prompt enhance history
CREATE TABLE IF NOT EXISTS prompt_enhance_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  input TEXT NOT NULL,
  output TEXT,
  status TEXT DEFAULT 'pending',
  duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_enhance_user ON prompt_enhance_logs(user_id, created_at DESC);
