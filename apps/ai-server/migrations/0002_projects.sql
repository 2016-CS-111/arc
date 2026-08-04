CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  root_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_root_path_unique UNIQUE (root_path),
  CONSTRAINT projects_root_path_length CHECK (char_length(root_path) <= 4096)
);

CREATE INDEX projects_updated_at_idx ON projects (updated_at DESC, id DESC);

CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
