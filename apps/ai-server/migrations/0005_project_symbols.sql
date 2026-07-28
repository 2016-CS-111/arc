CREATE TYPE project_symbol_index_status AS ENUM ('running', 'completed', 'limited', 'failed');
CREATE TYPE project_symbol_file_status AS ENUM (
  'parsed',
  'parsed_with_errors',
  'unsupported',
  'failed',
  'limited'
);

CREATE TABLE project_symbol_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_index_run_id UUID NOT NULL REFERENCES project_source_index_runs (id) ON DELETE CASCADE,
  status project_symbol_index_status NOT NULL DEFAULT 'running',
  parsed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (parsed_file_count >= 0),
  reused_file_count INTEGER NOT NULL DEFAULT 0 CHECK (reused_file_count >= 0),
  unsupported_file_count INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_file_count >= 0),
  failed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_file_count >= 0),
  symbol_count INTEGER NOT NULL DEFAULT 0 CHECK (symbol_count >= 0),
  omitted_symbol_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_symbol_count >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}',
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT project_symbol_index_runs_terminal_time CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT project_symbol_index_runs_failure_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL) OR
    (status <> 'failed' AND error_code IS NULL)
  ),
  CONSTRAINT project_symbol_index_runs_limit_reason CHECK (
    (status = 'limited' AND cardinality(limit_reasons) > 0) OR
    (status <> 'limited' AND cardinality(limit_reasons) = 0)
  ),
  CONSTRAINT project_symbol_index_runs_known_limits CHECK (
    limit_reasons <@ ARRAY['total_symbols']::TEXT[]
  )
);

CREATE UNIQUE INDEX project_symbol_index_runs_one_running_idx
ON project_symbol_index_runs (project_id)
WHERE status = 'running';

CREATE INDEX project_symbol_index_runs_project_started_idx
ON project_symbol_index_runs (project_id, started_at DESC, id DESC);

CREATE TABLE project_symbol_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  symbol_index_run_id UUID NOT NULL REFERENCES project_symbol_index_runs (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  relative_path TEXT NOT NULL,
  source_content_hash CHAR(64) NOT NULL,
  language VARCHAR(64) NOT NULL,
  parser_identity TEXT NOT NULL,
  status project_symbol_file_status NOT NULL,
  has_syntax_errors BOOLEAN NOT NULL DEFAULT FALSE,
  symbol_count INTEGER NOT NULL DEFAULT 0 CHECK (symbol_count >= 0),
  omitted_symbol_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_symbol_count >= 0),
  error_code VARCHAR(64),
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_symbol_files_project_source_unique UNIQUE (project_id, source_file_id),
  CONSTRAINT project_symbol_files_relative_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  ),
  CONSTRAINT project_symbol_files_source_hash CHECK (
    source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT project_symbol_files_outcome CHECK (
    (status = 'parsed' AND error_code IS NULL AND has_syntax_errors = FALSE) OR
    (status = 'parsed_with_errors' AND error_code IS NULL AND has_syntax_errors = TRUE) OR
    (status = 'unsupported' AND error_code = 'unsupported_language') OR
    (status = 'failed' AND error_code IN ('source_changed', 'source_read_error', 'parse_error')) OR
    (status = 'limited' AND error_code IN ('symbol_limit', 'symbol_text_limit'))
  )
);

CREATE INDEX project_symbol_files_run_idx
ON project_symbol_files (symbol_index_run_id);

CREATE INDEX project_symbol_files_project_path_idx
ON project_symbol_files (project_id, relative_path);

CREATE TABLE project_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  symbol_index_run_id UUID NOT NULL REFERENCES project_symbol_index_runs (id) ON DELETE CASCADE,
  symbol_file_id UUID NOT NULL REFERENCES project_symbol_files (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  identity_key CHAR(64) NOT NULL,
  parent_identity_key CHAR(64),
  kind VARCHAR(32) NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  exported BOOLEAN NOT NULL DEFAULT FALSE,
  start_byte INTEGER NOT NULL CHECK (start_byte >= 0),
  end_byte INTEGER NOT NULL CHECK (end_byte >= start_byte),
  start_line INTEGER NOT NULL CHECK (start_line >= 0),
  start_column_byte INTEGER NOT NULL CHECK (start_column_byte >= 0),
  end_line INTEGER NOT NULL CHECK (end_line >= start_line),
  end_column_byte INTEGER NOT NULL CHECK (end_column_byte >= 0),
  CONSTRAINT project_symbols_file_identity_unique UNIQUE (symbol_file_id, identity_key),
  CONSTRAINT project_symbols_name_length CHECK (octet_length(name) BETWEEN 1 AND 512),
  CONSTRAINT project_symbols_qualified_name_length CHECK (
    octet_length(qualified_name) BETWEEN 1 AND 2048
  )
);

CREATE INDEX project_symbols_run_idx
ON project_symbols (symbol_index_run_id);

CREATE INDEX project_symbols_project_name_idx
ON project_symbols (project_id, name);

CREATE INDEX project_symbols_project_kind_idx
ON project_symbols (project_id, kind);

CREATE INDEX project_symbols_source_file_idx
ON project_symbols (source_file_id);
