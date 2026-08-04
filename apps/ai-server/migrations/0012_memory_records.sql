CREATE TABLE memory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(16) NOT NULL CHECK (scope IN ('user', 'project')),
  project_id UUID REFERENCES projects (id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('user', 'project', 'architecture', 'convention', 'decision', 'business_rule')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  content_hash CHAR(64) NOT NULL,
  provenance VARCHAR(16) NOT NULL CHECK (provenance IN ('manual', 'assistant', 'import')),
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  embedding vector(1024),
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memory_records_scope_project_check CHECK (
    (scope = 'user' AND project_id IS NULL) OR (scope = 'project' AND project_id IS NOT NULL)
  )
);

CREATE INDEX memory_records_scope_project_updated_idx
  ON memory_records (scope, project_id, pinned DESC, updated_at DESC, id DESC);
CREATE INDEX memory_records_content_hash_idx
  ON memory_records (scope, project_id, kind, content_hash);
CREATE INDEX memory_records_search_idx
  ON memory_records USING GIN (to_tsvector('simple'::REGCONFIG, content));
CREATE INDEX memory_records_embedding_idx
  ON memory_records USING hnsw (embedding vector_cosine_ops);
