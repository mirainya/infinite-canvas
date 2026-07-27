-- 008: Infinite Canvas V2 核心数据结构
-- 变更原因: V2 使用云端项目、不可变版本、素材库和服务端工作流任务。
-- 影响范围: 仅新增 V2 表和索引，不修改 V1 数据。

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    name TEXT NOT NULL DEFAULT '未命名项目',
    description TEXT NOT NULL DEFAULT '',
    graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT projects_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT projects_revision_positive CHECK (revision > 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
    ON projects(owner_id, updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS project_versions (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    graph JSONB NOT NULL,
    viewport JSONB NOT NULL,
    settings JSONB NOT NULL,
    reason TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project
    ON project_versions(project_id, revision DESC);

CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'image',
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    original_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT assets_kind_valid CHECK (kind IN ('image', 'mask', 'output')),
    CONSTRAINT assets_size_valid CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_assets_owner_created
    ON assets(owner_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_project
    ON assets(project_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_templates_v2 (
    id UUID PRIMARY KEY,
    owner_id BIGINT,
    slug TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'custom',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    graph JSONB NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT templates_owner_valid CHECK (is_system OR owner_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_templates_v2_catalog
    ON workflow_templates_v2(is_published, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_v2_owner
    ON workflow_templates_v2(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS template_versions (
    id BIGSERIAL PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES workflow_templates_v2(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    graph JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id BIGINT NOT NULL,
    project_revision INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    input_snapshot JSONB NOT NULL,
    output_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_id TEXT NOT NULL UNIQUE,
    credits_reserved INTEGER NOT NULL DEFAULT 0,
    credits_used INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    worker_id TEXT,
    heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    CONSTRAINT workflow_runs_status_valid CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
    ),
    CONSTRAINT workflow_runs_progress_valid CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT workflow_runs_credits_valid CHECK (credits_reserved >= 0 AND credits_used >= 0)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_queue
    ON workflow_runs(status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner
    ON workflow_runs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_project
    ON workflow_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS node_runs (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_id TEXT UNIQUE,
    credits_used INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    UNIQUE(run_id, node_id),
    CONSTRAINT node_runs_status_valid CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_node_runs_run_sequence
    ON node_runs(run_id, sequence);

CREATE TABLE IF NOT EXISTS extensions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active_version TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extension_versions (
    id BIGSERIAL PRIMARY KEY,
    extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    path TEXT NOT NULL,
    manifest JSONB NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(extension_id, version)
);
