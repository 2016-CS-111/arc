CREATE TYPE project_embedding_index_status AS ENUM ('running', 'completed', 'limited', 'failed');
CREATE TYPE project_embedding_file_status AS ENUM ('indexed', 'limited');

CREATE TABLE project_embedding_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_index_run_id UUID NOT NULL REFERENCES project_source_index_runs (id) ON DELETE CASCADE,
  symbol_index_run_id UUID NOT NULL REFERENCES project_symbol_index_runs (id) ON DELETE CASCADE,
  dependency_index_run_id UUID NOT NULL REFERENCES project_dependency_index_runs (id) ON DELETE CASCADE,
  framework_index_run_id UUID NOT NULL REFERENCES project_framework_index_runs (id) ON DELETE CASCADE,
  status project_embedding_index_status NOT NULL DEFAULT 'running',
  provider VARCHAR(32) NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions = 1024),
  input_format TEXT NOT NULL,
  chunker_identity TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  embedded_chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (embedded_chunk_count >= 0),
  reused_chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (reused_chunk_count >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}',
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT project_embedding_runs_terminal_time CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX project_embedding_runs_one_running_idx
  ON project_embedding_index_runs (project_id)
  WHERE status = 'running';

CREATE TABLE project_embedding_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  embedding_index_run_id UUID NOT NULL REFERENCES project_embedding_index_runs (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  relative_path TEXT NOT NULL,
  source_content_hash CHAR(64) NOT NULL,
  language VARCHAR(64) NOT NULL,
  status project_embedding_file_status NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_embedding_files_source_unique UNIQUE (project_id, source_file_id)
);

CREATE TABLE project_embedding_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  embedding_index_run_id UUID NOT NULL REFERENCES project_embedding_index_runs (id) ON DELETE CASCADE,
  embedding_file_id UUID NOT NULL REFERENCES project_embedding_files (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  identity_key CHAR(64) NOT NULL,
  relative_path TEXT NOT NULL,
  language VARCHAR(64) NOT NULL,
  source_content_hash CHAR(64) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  input_format TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions = 1024),
  owner_symbol_id UUID,
  owner_symbol_identity_key CHAR(64),
  owner_symbol_kind VARCHAR(32),
  owner_symbol_name TEXT,
  owner_symbol_qualified_name TEXT,
  start_byte INTEGER NOT NULL CHECK (start_byte >= 0),
  end_byte INTEGER NOT NULL CHECK (end_byte > start_byte),
  start_line INTEGER NOT NULL CHECK (start_line >= 0),
  start_column_byte INTEGER NOT NULL CHECK (start_column_byte >= 0),
  end_line INTEGER NOT NULL CHECK (end_line >= 0),
  end_column_byte INTEGER NOT NULL CHECK (end_column_byte >= 0),
  embedding vector(1024) NOT NULL,
  CONSTRAINT project_embedding_chunks_identity_unique UNIQUE (project_id, identity_key)
);

CREATE INDEX project_embedding_chunks_run_path_idx
  ON project_embedding_chunks (project_id, embedding_index_run_id, relative_path, start_byte, id);
CREATE INDEX project_embedding_chunks_cosine_idx
  ON project_embedding_chunks USING hnsw (embedding vector_cosine_ops);
