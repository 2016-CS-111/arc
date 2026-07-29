ALTER TABLE project_framework_index_runs
  ADD COLUMN unsupported_file_count INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_file_count >= 0),
  ADD COLUMN failed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_file_count >= 0),
  ADD COLUMN unresolved_relationship_count INTEGER NOT NULL DEFAULT 0 CHECK (unresolved_relationship_count >= 0),
  ADD CONSTRAINT project_framework_runs_failure_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL) OR
    (status <> 'failed' AND error_code IS NULL)
  ),
  ADD CONSTRAINT project_framework_runs_limit_reason CHECK (
    (status = 'limited' AND cardinality(limit_reasons) > 0) OR
    (status <> 'limited' AND cardinality(limit_reasons) = 0)
  ),
  ADD CONSTRAINT project_framework_runs_known_limits CHECK (
    limit_reasons <@ ARRAY[
      'source_catalog_limited',
      'symbol_catalog_limited',
      'dependency_catalog_limited',
      'upstream_file_gaps',
      'file_limits',
      'total_entities',
      'total_relationships'
    ]::TEXT[]
  ),
  ADD CONSTRAINT project_framework_runs_known_warnings CHECK (
    warnings <@ ARRAY['package_metadata_invalid']::TEXT[]
  ),
  ADD CONSTRAINT project_framework_runs_known_error CHECK (
    error_code IS NULL OR error_code IN (
      'analyzer_unavailable',
      'upstream_catalog_changed',
      'framework_persistence_error',
      'index_interrupted',
      'unknown_error'
    )
  ),
  ADD CONSTRAINT project_framework_runs_analyzer_identity CHECK (
    analyzer_set_identity ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT project_framework_runs_unresolved_count CHECK (
    unresolved_relationship_count <= relationship_count
  );

ALTER TABLE project_framework_scopes
  ADD COLUMN evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD CONSTRAINT project_framework_scopes_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  ADD CONSTRAINT project_framework_scopes_identity CHECK (
    scope_key ~ '^[0-9a-f]{64}$' AND context_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT project_framework_scopes_root_path_length CHECK (
    char_length(root_path) BETWEEN 1 AND 4096
  );

ALTER TABLE project_framework_files
  ADD COLUMN extractor_identity TEXT NOT NULL DEFAULT 'unsupported',
  ADD COLUMN evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN extraction_omission_count INTEGER NOT NULL DEFAULT 0 CHECK (extraction_omission_count >= 0),
  ADD COLUMN extraction_omission_reasons TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT project_framework_files_evidence_array CHECK (jsonb_typeof(evidence) = 'array'),
  ADD CONSTRAINT project_framework_files_source_reference FOREIGN KEY (source_file_id)
    REFERENCES project_source_files (id) ON DELETE CASCADE,
  ADD CONSTRAINT project_framework_files_source_hash CHECK (
    source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT project_framework_files_relative_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  ),
  ADD CONSTRAINT project_framework_files_outcome CHECK (
    (
      status IN ('analyzed', 'analyzed_with_errors') AND
      error_code IS NULL
    ) OR (
      status IN ('unsupported', 'failed', 'limited') AND
      error_code IS NOT NULL
    )
  );

ALTER TABLE project_framework_entities
  ADD CONSTRAINT project_framework_entities_source_reference FOREIGN KEY (source_file_id)
    REFERENCES project_source_files (id) ON DELETE CASCADE,
  ADD CONSTRAINT project_framework_entities_symbol_reference FOREIGN KEY (symbol_id)
    REFERENCES project_symbols (id) ON DELETE SET NULL,
  ADD CONSTRAINT project_framework_entities_identity CHECK (
    identity_key ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT project_framework_entities_path_length CHECK (
    char_length(relative_path) BETWEEN 1 AND 4096
  ),
  ADD CONSTRAINT project_framework_entities_name_length CHECK (
    char_length(name) BETWEEN 1 AND 4096
  ),
  ADD CONSTRAINT project_framework_entities_range_object CHECK (
    range IS NULL OR jsonb_typeof(range) = 'object'
  ),
  ADD CONSTRAINT project_framework_entities_attributes_object CHECK (
    jsonb_typeof(attributes) = 'object'
  );

ALTER TABLE project_framework_relationships
  ADD CONSTRAINT project_framework_relationships_source_file_reference FOREIGN KEY (source_file_id)
    REFERENCES project_source_files (id) ON DELETE SET NULL,
  ADD CONSTRAINT project_framework_relationships_symbol_reference FOREIGN KEY (symbol_id)
    REFERENCES project_symbols (id) ON DELETE SET NULL,
  ADD CONSTRAINT project_framework_relationships_dependency_reference FOREIGN KEY (dependency_edge_id)
    REFERENCES project_dependency_edges (id) ON DELETE SET NULL,
  ADD CONSTRAINT project_framework_relationships_identity CHECK (
    identity_key ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT project_framework_relationships_target_name_length CHECK (
    target_name IS NULL OR char_length(target_name) BETWEEN 1 AND 4096
  ),
  ADD CONSTRAINT project_framework_relationships_range_object CHECK (
    range IS NULL OR jsonb_typeof(range) = 'object'
  ),
  ADD CONSTRAINT project_framework_relationships_attributes_object CHECK (
    jsonb_typeof(attributes) = 'object'
  );

CREATE INDEX project_framework_runs_project_started_idx
ON project_framework_index_runs (project_id, started_at DESC, id DESC);

CREATE INDEX project_framework_files_run_idx
ON project_framework_files (framework_index_run_id);

CREATE INDEX project_framework_entities_scope_kind_idx
ON project_framework_entities (scope_id, framework, entity_kind, relative_path);

CREATE INDEX project_framework_relationships_scope_kind_idx
ON project_framework_relationships (scope_id, framework, relationship_kind);
