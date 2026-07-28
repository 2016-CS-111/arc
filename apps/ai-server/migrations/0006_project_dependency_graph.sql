CREATE TYPE project_dependency_index_status AS ENUM ('running', 'completed', 'limited', 'failed');
CREATE TYPE project_dependency_file_status AS ENUM (
  'extracted',
  'extracted_with_errors',
  'unsupported',
  'failed',
  'limited'
);
CREATE TYPE project_dependency_resolution_kind AS ENUM ('local', 'external', 'builtin', 'unresolved');

CREATE TABLE project_dependency_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_index_run_id UUID NOT NULL REFERENCES project_source_index_runs (id) ON DELETE CASCADE,
  status project_dependency_index_status NOT NULL DEFAULT 'running',
  resolution_context_hash CHAR(64),
  parsed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (parsed_file_count >= 0),
  reused_file_count INTEGER NOT NULL DEFAULT 0 CHECK (reused_file_count >= 0),
  unsupported_file_count INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_file_count >= 0),
  failed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_file_count >= 0),
  edge_count INTEGER NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  binding_count INTEGER NOT NULL DEFAULT 0 CHECK (binding_count >= 0),
  omitted_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_edge_count >= 0),
  omitted_binding_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_binding_count >= 0),
  local_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (local_edge_count >= 0),
  external_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (external_edge_count >= 0),
  builtin_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (builtin_edge_count >= 0),
  unresolved_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (unresolved_edge_count >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}',
  resolver_warnings TEXT[] NOT NULL DEFAULT '{}',
  error_code VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT project_dependency_runs_terminal_time CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT project_dependency_runs_failure_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL) OR
    (status <> 'failed' AND error_code IS NULL)
  ),
  CONSTRAINT project_dependency_runs_limit_reason CHECK (
    (status = 'limited' AND cardinality(limit_reasons) > 0) OR
    (status <> 'limited' AND cardinality(limit_reasons) = 0)
  ),
  CONSTRAINT project_dependency_runs_known_limits CHECK (
    limit_reasons <@ ARRAY['total_edges', 'total_bindings']::TEXT[]
  ),
  CONSTRAINT project_dependency_runs_known_warnings CHECK (
    resolver_warnings <@ ARRAY[
      'config_missing',
      'config_invalid',
      'config_extends_missing',
      'config_extends_outside_project',
      'config_extends_cycle',
      'package_metadata_invalid'
    ]::TEXT[]
  ),
  CONSTRAINT project_dependency_runs_resolution_context CHECK (
    (
      status IN ('completed', 'limited') AND
      resolution_context_hash ~ '^[0-9a-f]{64}$'
    ) OR status IN ('running', 'failed')
  ),
  CONSTRAINT project_dependency_runs_resolution_counts CHECK (
    edge_count = local_edge_count + external_edge_count + builtin_edge_count + unresolved_edge_count
  )
);

CREATE UNIQUE INDEX project_dependency_runs_one_running_idx
ON project_dependency_index_runs (project_id)
WHERE status = 'running';

CREATE INDEX project_dependency_runs_project_started_idx
ON project_dependency_index_runs (project_id, started_at DESC, id DESC);

CREATE TABLE project_dependency_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  dependency_index_run_id UUID NOT NULL REFERENCES project_dependency_index_runs (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  relative_path TEXT NOT NULL,
  source_content_hash CHAR(64) NOT NULL,
  language VARCHAR(64) NOT NULL,
  extractor_identity TEXT NOT NULL,
  status project_dependency_file_status NOT NULL,
  has_syntax_errors BOOLEAN NOT NULL DEFAULT FALSE,
  edge_count INTEGER NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  binding_count INTEGER NOT NULL DEFAULT 0 CHECK (binding_count >= 0),
  omitted_edge_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_edge_count >= 0),
  omitted_binding_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_binding_count >= 0),
  error_code VARCHAR(64),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_dependency_files_project_source_unique UNIQUE (project_id, source_file_id),
  CONSTRAINT project_dependency_files_relative_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  ),
  CONSTRAINT project_dependency_files_source_hash CHECK (
    source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT project_dependency_files_outcome CHECK (
    (status = 'extracted' AND error_code IS NULL AND has_syntax_errors = FALSE) OR
    (status = 'extracted_with_errors' AND error_code IS NULL AND has_syntax_errors = TRUE) OR
    (status = 'unsupported' AND error_code = 'unsupported_language') OR
    (status = 'failed' AND error_code IN ('source_changed', 'source_read_error', 'parse_error')) OR
    (status = 'limited' AND error_code IN ('dependency_limit', 'dependency_text_limit'))
  )
);

CREATE INDEX project_dependency_files_run_idx
ON project_dependency_files (dependency_index_run_id);

CREATE INDEX project_dependency_files_project_path_idx
ON project_dependency_files (project_id, relative_path);

CREATE TABLE project_dependency_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  dependency_index_run_id UUID NOT NULL REFERENCES project_dependency_index_runs (id) ON DELETE CASCADE,
  dependency_file_id UUID NOT NULL REFERENCES project_dependency_files (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  extraction_key CHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  specifier TEXT NOT NULL,
  type_only BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_kind project_dependency_resolution_kind NOT NULL,
  target_source_file_id UUID,
  target_relative_path TEXT,
  external_package TEXT,
  unresolved_reason VARCHAR(64),
  start_byte INTEGER NOT NULL CHECK (start_byte >= 0),
  end_byte INTEGER NOT NULL CHECK (end_byte >= start_byte),
  start_line INTEGER NOT NULL CHECK (start_line >= 0),
  start_column_byte INTEGER NOT NULL CHECK (start_column_byte >= 0),
  end_line INTEGER NOT NULL CHECK (end_line >= start_line),
  end_column_byte INTEGER NOT NULL CHECK (end_column_byte >= 0),
  specifier_start_byte INTEGER NOT NULL CHECK (specifier_start_byte >= 0),
  specifier_end_byte INTEGER NOT NULL CHECK (specifier_end_byte >= specifier_start_byte),
  specifier_start_line INTEGER NOT NULL CHECK (specifier_start_line >= 0),
  specifier_start_column_byte INTEGER NOT NULL CHECK (specifier_start_column_byte >= 0),
  specifier_end_line INTEGER NOT NULL CHECK (specifier_end_line >= specifier_start_line),
  specifier_end_column_byte INTEGER NOT NULL CHECK (specifier_end_column_byte >= 0),
  CONSTRAINT project_dependency_edges_file_key_unique UNIQUE (dependency_file_id, extraction_key),
  CONSTRAINT project_dependency_edges_extraction_key CHECK (
    extraction_key ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT project_dependency_edges_specifier_length CHECK (
    octet_length(specifier) BETWEEN 1 AND 1024
  ),
  CONSTRAINT project_dependency_edges_target_path_length CHECK (
    target_relative_path IS NULL OR char_length(target_relative_path) BETWEEN 1 AND 4096
  ),
  CONSTRAINT project_dependency_edges_external_length CHECK (
    external_package IS NULL OR octet_length(external_package) BETWEEN 1 AND 1024
  ),
  CONSTRAINT project_dependency_edges_resolution CHECK (
    (
      resolution_kind = 'local' AND
      target_source_file_id IS NOT NULL AND
      target_relative_path IS NOT NULL AND
      external_package IS NULL AND
      unresolved_reason IS NULL
    ) OR (
      resolution_kind = 'external' AND
      target_source_file_id IS NULL AND
      target_relative_path IS NULL AND
      external_package IS NOT NULL AND
      unresolved_reason IS NULL
    ) OR (
      resolution_kind = 'builtin' AND
      target_source_file_id IS NULL AND
      target_relative_path IS NULL AND
      external_package IS NULL AND
      unresolved_reason IS NULL
    ) OR (
      resolution_kind = 'unresolved' AND
      target_source_file_id IS NULL AND
      target_relative_path IS NULL AND
      external_package IS NULL AND
      unresolved_reason IS NOT NULL
    )
  )
);

CREATE INDEX project_dependency_edges_run_idx
ON project_dependency_edges (dependency_index_run_id);

CREATE INDEX project_dependency_edges_source_idx
ON project_dependency_edges (project_id, source_file_id);

CREATE INDEX project_dependency_edges_target_idx
ON project_dependency_edges (project_id, target_source_file_id)
WHERE target_source_file_id IS NOT NULL;

CREATE INDEX project_dependency_edges_resolution_idx
ON project_dependency_edges (project_id, resolution_kind);

CREATE TABLE project_dependency_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  dependency_index_run_id UUID NOT NULL REFERENCES project_dependency_index_runs (id) ON DELETE CASCADE,
  dependency_edge_id UUID NOT NULL REFERENCES project_dependency_edges (id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL,
  binding_key CHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  imported_name TEXT,
  local_name TEXT,
  exported_name TEXT,
  type_only BOOLEAN NOT NULL DEFAULT FALSE,
  start_byte INTEGER,
  end_byte INTEGER,
  start_line INTEGER,
  start_column_byte INTEGER,
  end_line INTEGER,
  end_column_byte INTEGER,
  CONSTRAINT project_dependency_bindings_edge_key_unique UNIQUE (dependency_edge_id, binding_key),
  CONSTRAINT project_dependency_bindings_key CHECK (
    binding_key ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT project_dependency_bindings_names CHECK (
    (imported_name IS NULL OR octet_length(imported_name) BETWEEN 1 AND 512) AND
    (local_name IS NULL OR octet_length(local_name) BETWEEN 1 AND 512) AND
    (exported_name IS NULL OR octet_length(exported_name) BETWEEN 1 AND 512)
  ),
  CONSTRAINT project_dependency_bindings_range CHECK (
    (
      start_byte IS NULL AND
      end_byte IS NULL AND
      start_line IS NULL AND
      start_column_byte IS NULL AND
      end_line IS NULL AND
      end_column_byte IS NULL
    ) OR (
      start_byte >= 0 AND
      end_byte >= start_byte AND
      start_line >= 0 AND
      start_column_byte >= 0 AND
      end_line >= start_line AND
      end_column_byte >= 0
    )
  )
);

CREATE INDEX project_dependency_bindings_run_idx
ON project_dependency_bindings (dependency_index_run_id);

CREATE INDEX project_dependency_bindings_source_idx
ON project_dependency_bindings (project_id, source_file_id);
