-- 工作流模板表
CREATE TABLE IF NOT EXISTS workflow_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    thumbnail TEXT NOT NULL DEFAULT '',
    nodes_json JSONB NOT NULL,
    edges_json JSONB NOT NULL,
    user_id INTEGER REFERENCES users(id),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_user ON workflow_templates(user_id);
CREATE INDEX idx_templates_public ON workflow_templates(is_public) WHERE is_public = TRUE;
