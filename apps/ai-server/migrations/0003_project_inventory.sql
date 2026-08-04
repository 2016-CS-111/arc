CREATE TYPE project_scan_status AS ENUM ('running', 'completed', 'limited', 'failed');

CREATE TABLE project_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status project_scan_status NOT NULL DEFAULT 'running',
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  ignored_path_count INTEGER NOT NULL DEFAULT 0 CHECK (ignored_path_count >= 0),
  skipped_symlink_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_symlink_count >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}',
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT project_scans_terminal_time CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT project_scans_failure_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL) OR
    (status <> 'failed' AND error_code IS NULL)
  ),
  CONSTRAINT project_scans_limit_reason CHECK (
    (status = 'limited' AND cardinality(limit_reasons) > 0) OR
    (status <> 'limited' AND cardinality(limit_reasons) = 0)
  ),
  CONSTRAINT project_scans_known_limits CHECK (
    limit_reasons <@ ARRAY['file_count', 'total_bytes', 'depth']::TEXT[]
  )
);

CREATE UNIQUE INDEX project_scans_one_running_idx
ON project_scans (project_id)
WHERE status = 'running';

CREATE INDEX project_scans_project_started_idx
ON project_scans (project_id, started_at DESC, id DESC);

CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES project_scans (id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  modified_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT project_files_project_path_unique UNIQUE (project_id, relative_path),
  CONSTRAINT project_files_relative_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  )
);

CREATE INDEX project_files_scan_idx
ON project_files (scan_id);
