CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE conversation_message_role AS ENUM ('user', 'assistant');
CREATE TYPE conversation_message_status AS ENUM ('pending', 'streaming', 'completed', 'cancelled', 'failed');

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL DEFAULT 'New chat',
  next_message_ordinal BIGINT NOT NULL DEFAULT 0 CHECK (next_message_ordinal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  request_id VARCHAR(160) NOT NULL,
  ordinal BIGINT NOT NULL CHECK (ordinal > 0),
  role conversation_message_role NOT NULL,
  status conversation_message_status NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_messages_session_ordinal_unique UNIQUE (session_id, ordinal),
  CONSTRAINT chat_messages_request_role_unique UNIQUE (session_id, request_id, role),
  CONSTRAINT chat_messages_user_completed CHECK (role = 'assistant' OR status = 'completed'),
  CONSTRAINT chat_messages_failed_error CHECK (
    (status = 'failed' AND error IS NOT NULL) OR (status <> 'failed' AND error IS NULL)
  )
);

CREATE INDEX chat_sessions_updated_at_idx ON chat_sessions (updated_at DESC, id DESC);
CREATE INDEX chat_messages_session_ordinal_idx ON chat_messages (session_id, ordinal);

CREATE FUNCTION set_row_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION touch_chat_session_updated_at() RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions SET updated_at = NOW() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_sessions_set_updated_at
BEFORE UPDATE ON chat_sessions
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER chat_messages_set_updated_at
BEFORE UPDATE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TRIGGER chat_messages_touch_session
AFTER INSERT OR UPDATE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION touch_chat_session_updated_at();
