CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE import_batches (
  id UUID PRIMARY KEY,
  archive_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  project_name TEXT,
  suite_name TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  product_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE visual_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  primary_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checksum TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  display_name TEXT,
  source_key TEXT NOT NULL,
  preview_key TEXT,
  mime_type TEXT NOT NULL,
  suite_id UUID REFERENCES visual_suites(id) ON DELETE SET NULL,
  material_type TEXT NOT NULL DEFAULT 'OTHER',
  grade TEXT,
  subject TEXT,
  colors TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  ocr_text TEXT,
  visual_style TEXT,
  layout_features TEXT,
  core_elements TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  reuse_state TEXT NOT NULL DEFAULT 'ADAPT_REQUIRED',
  review_state TEXT NOT NULL DEFAULT 'PENDING',
  confidence REAL,
  analysis_json JSONB,
  analysis_status TEXT NOT NULL DEFAULT 'QUEUED',
  embedding_status TEXT NOT NULL DEFAULT 'NOT_READY',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visual_suites ADD CONSTRAINT visual_suites_primary_asset_fkey FOREIGN KEY (primary_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

CREATE TABLE import_batch_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  checksum TEXT,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, source_path)
);

CREATE TABLE asset_embeddings (
  asset_id UUID PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  text_embedding vector(1024) NOT NULL,
  image_embedding vector(1024) NOT NULL,
  model_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE design_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id UUID REFERENCES design_tasks(id) ON DELETE SET NULL,
  brief TEXT NOT NULL,
  analysis JSONB NOT NULL,
  reference_ids UUID[] NOT NULL,
  report JSONB,
  prompt JSONB,
  generation_model TEXT,
  generation_key TEXT,
  generation_error TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE design_task_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES design_tasks(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE design_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES design_tasks(id) ON DELETE CASCADE,
  parent_version_id UUID REFERENCES design_versions(id) ON DELETE SET NULL,
  prompt JSONB NOT NULL,
  size TEXT NOT NULL,
  source_keys JSONB NOT NULL DEFAULT '[]',
  output_key TEXT,
  model_name TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX assets_review_idx ON assets (suite_id, material_type, review_state, reuse_state);
CREATE INDEX assets_retrieval_filter_idx ON assets (material_type, grade, subject, suite_id)
  WHERE review_state = 'CONFIRMED' AND reuse_state <> 'NOT_REUSABLE' AND embedding_status = 'READY';
CREATE INDEX batch_files_batch_idx ON import_batch_files (batch_id, status);
CREATE INDEX jobs_claim_idx ON jobs (status, created_at);
CREATE INDEX design_task_references_task_idx ON design_task_references (task_id, created_at);
CREATE INDEX design_versions_task_idx ON design_versions (task_id, created_at DESC);
CREATE INDEX embeddings_text_hnsw ON asset_embeddings USING hnsw (text_embedding vector_cosine_ops);
CREATE INDEX embeddings_image_hnsw ON asset_embeddings USING hnsw (image_embedding vector_cosine_ops);
