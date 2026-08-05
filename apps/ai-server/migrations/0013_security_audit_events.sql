CREATE TABLE IF NOT EXISTS security_audit_events (
  id UUID PRIMARY KEY,
  category VARCHAR(16) NOT NULL,
  action VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  subject_id VARCHAR(160) NOT NULL,
  project_id UUID NULL,
  request_id VARCHAR(160) NULL,
  session_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_audit_events_created_idx
  ON security_audit_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS security_audit_events_project_created_idx
  ON security_audit_events (project_id, created_at DESC, id DESC);
