CREATE TYPE project_framework_index_status AS ENUM ('running', 'completed', 'limited', 'failed');
CREATE TYPE project_framework_file_status AS ENUM ('analyzed', 'analyzed_with_errors', 'unsupported', 'failed', 'limited');

CREATE TABLE project_framework_index_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source_index_run_id UUID NOT NULL REFERENCES project_source_index_runs (id) ON DELETE CASCADE,
  symbol_index_run_id UUID NOT NULL REFERENCES project_symbol_index_runs (id) ON DELETE CASCADE,
  dependency_index_run_id UUID NOT NULL REFERENCES project_dependency_index_runs (id) ON DELETE CASCADE,
  status project_framework_index_status NOT NULL DEFAULT 'running',
  analyzer_set_identity CHAR(64) NOT NULL,
  scope_count INTEGER NOT NULL DEFAULT 0 CHECK (scope_count >= 0), analyzed_file_count INTEGER NOT NULL DEFAULT 0 CHECK (analyzed_file_count >= 0), reused_file_count INTEGER NOT NULL DEFAULT 0 CHECK (reused_file_count >= 0),
  entity_count INTEGER NOT NULL DEFAULT 0 CHECK (entity_count >= 0), relationship_count INTEGER NOT NULL DEFAULT 0 CHECK (relationship_count >= 0), omission_count INTEGER NOT NULL DEFAULT 0 CHECK (omission_count >= 0),
  limit_reasons TEXT[] NOT NULL DEFAULT '{}', warnings TEXT[] NOT NULL DEFAULT '{}', error_code VARCHAR(64), started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
  CONSTRAINT project_framework_runs_terminal_time CHECK ((status = 'running' AND completed_at IS NULL) OR (status <> 'running' AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX project_framework_runs_one_running_idx ON project_framework_index_runs (project_id) WHERE status = 'running';

CREATE TABLE project_framework_scopes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE, framework_index_run_id UUID NOT NULL REFERENCES project_framework_index_runs (id) ON DELETE CASCADE,
 scope_key CHAR(64) NOT NULL, framework VARCHAR(32) NOT NULL, root_path TEXT NOT NULL, package_name TEXT, context_hash CHAR(64) NOT NULL,
 CONSTRAINT project_framework_scopes_key_unique UNIQUE (project_id, scope_key)
);
CREATE TABLE project_framework_files (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE, framework_index_run_id UUID NOT NULL REFERENCES project_framework_index_runs (id) ON DELETE CASCADE, scope_id UUID NOT NULL REFERENCES project_framework_scopes (id) ON DELETE CASCADE,
 source_file_id UUID NOT NULL, relative_path TEXT NOT NULL, source_content_hash CHAR(64) NOT NULL, language VARCHAR(64) NOT NULL, analyzer_identity TEXT NOT NULL, status project_framework_file_status NOT NULL, has_syntax_errors BOOLEAN NOT NULL DEFAULT FALSE,
 entity_count INTEGER NOT NULL DEFAULT 0, relationship_count INTEGER NOT NULL DEFAULT 0, omission_count INTEGER NOT NULL DEFAULT 0, error_code VARCHAR(64), analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_framework_files_project_scope_source_unique UNIQUE (project_id, scope_id, source_file_id)
);
CREATE TABLE project_framework_entities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE, framework_index_run_id UUID NOT NULL REFERENCES project_framework_index_runs (id) ON DELETE CASCADE, scope_id UUID NOT NULL REFERENCES project_framework_scopes (id) ON DELETE CASCADE, framework_file_id UUID NOT NULL REFERENCES project_framework_files (id) ON DELETE CASCADE,
 source_file_id UUID NOT NULL, identity_key CHAR(64) NOT NULL, framework VARCHAR(32) NOT NULL, entity_kind VARCHAR(32) NOT NULL, name TEXT NOT NULL, relative_path TEXT NOT NULL, symbol_id UUID, evidence_kind VARCHAR(32) NOT NULL, certainty VARCHAR(32) NOT NULL, range JSONB, attributes JSONB NOT NULL,
 CONSTRAINT project_framework_entities_identity_unique UNIQUE (project_id, identity_key)
);
CREATE TABLE project_framework_relationships (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE, framework_index_run_id UUID NOT NULL REFERENCES project_framework_index_runs (id) ON DELETE CASCADE, scope_id UUID NOT NULL REFERENCES project_framework_scopes (id) ON DELETE CASCADE,
 source_entity_id UUID NOT NULL REFERENCES project_framework_entities (id) ON DELETE CASCADE, target_entity_id UUID REFERENCES project_framework_entities (id) ON DELETE SET NULL, source_file_id UUID, dependency_edge_id UUID, symbol_id UUID, identity_key CHAR(64) NOT NULL, framework VARCHAR(32) NOT NULL, relationship_kind VARCHAR(32) NOT NULL, target_name TEXT, evidence_kind VARCHAR(32) NOT NULL, certainty VARCHAR(32) NOT NULL, range JSONB, attributes JSONB NOT NULL,
 CONSTRAINT project_framework_relationships_identity_unique UNIQUE (project_id, identity_key)
);
