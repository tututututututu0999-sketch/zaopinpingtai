CREATE TABLE IF NOT EXISTS visual_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
 rule_version TEXT NOT NULL, candidate JSONB, confirmed JSONB, adaptation_notes TEXT NOT NULL DEFAULT '',
 summary TEXT, content_hash TEXT, status TEXT NOT NULL DEFAULT 'QUEUED', error_message TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visual_revisions_asset_idx ON visual_revisions(asset_id,created_at DESC);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS active_visual_revision_id UUID REFERENCES visual_revisions(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS target_visual_revision_id UUID REFERENCES visual_revisions(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS adaptation_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE asset_embeddings ADD COLUMN IF NOT EXISTS visual_revision_id UUID REFERENCES visual_revisions(id) ON DELETE SET NULL;
ALTER TABLE asset_embeddings ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE TABLE IF NOT EXISTS brief_drafts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), original_brief TEXT NOT NULL,
 latest_revision INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS brief_revisions (
 draft_id UUID NOT NULL REFERENCES brief_drafts(id), revision INTEGER NOT NULL,
 supplements JSONB NOT NULL DEFAULT '[]', analysis JSONB NOT NULL,
 confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(draft_id,revision)
);
ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS brief_draft_id UUID REFERENCES brief_drafts(id);
ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS brief_revision INTEGER;
ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS reference_snapshot JSONB;
