CREATE TYPE project_source_index_status AS ENUM ('running', 'completed', 'limited', 'failed');
CREATE TYPE project_source_file_status AS ENUM ('ready', 'skipped');

CREATE TABLE project_source_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  inventory_scan_id UUID NOT NULL REFERENCES project_scans (id) ON DELETE CASCADE,
  status project_source_index_status NOT NULL DEFAULT 'running',
  ready_file_count INTEGER NOT NULL DEFAULT 0 CHECK (ready_file_count >= 0),
  skipped_file_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_file_count >= 0),
  inspected_bytes BIGINT NOT NULL DEFAULT 0 CHECK (inspected_bytes >= 0),
  ready_bytes BIGINT NOT NULL DEFAULT 0 CHECK (ready_bytes >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}',
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT project_source_index_runs_terminal_time CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT project_source_index_runs_failure_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL) OR
    (status <> 'failed' AND error_code IS NULL)
  ),
  CONSTRAINT project_source_index_runs_limit_reason CHECK (
    (status = 'limited' AND cardinality(limit_reasons) > 0) OR
    (status <> 'limited' AND cardinality(limit_reasons) = 0)
  ),
  CONSTRAINT project_source_index_runs_known_limits CHECK (
    limit_reasons <@ ARRAY['total_bytes']::TEXT[]
  ),
  CONSTRAINT project_source_index_runs_ready_bytes CHECK (
    ready_bytes <= inspected_bytes
  )
);

CREATE UNIQUE INDEX project_source_index_runs_one_running_idx
ON project_source_index_runs (project_id)
WHERE status = 'running';

CREATE INDEX project_source_index_runs_project_started_idx
ON project_source_index_runs (project_id, started_at DESC, id DESC);

CREATE TABLE project_source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_index_run_id UUID NOT NULL REFERENCES project_source_index_runs (id) ON DELETE CASCADE,
  inventory_scan_id UUID NOT NULL REFERENCES project_scans (id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  status project_source_file_status NOT NULL,
  skip_reason VARCHAR(64),
  content_hash CHAR(64),
  language VARCHAR(64),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  modified_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_source_files_project_path_unique UNIQUE (project_id, relative_path),
  CONSTRAINT project_source_files_relative_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  ),
  CONSTRAINT project_source_files_outcome CHECK (
    (
      status = 'ready' AND
      skip_reason IS NULL AND
      content_hash ~ '^[0-9a-f]{64}$' AND
      language IS NOT NULL
    ) OR (
      status = 'skipped' AND
      skip_reason IS NOT NULL AND
      content_hash IS NULL AND
      language IS NULL
    )
  )
);

CREATE INDEX project_source_files_run_idx
ON project_source_files (source_index_run_id);

CREATE INDEX project_source_files_project_status_idx
ON project_source_files (project_id, status);
