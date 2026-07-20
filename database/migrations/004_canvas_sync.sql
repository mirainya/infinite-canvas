-- Canvas cloud sync
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL DEFAULT '未命名项目',
  snapshot JSONB NOT NULL,
  versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canvases_user ON canvases(user_id, updated_at DESC);
