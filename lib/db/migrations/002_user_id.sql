-- Migration 002: Add user_id to support multi-tenant SaaS
-- Open source default: 'anonymous' — behavior unchanged

ALTER TABLE analyses ADD COLUMN user_id TEXT DEFAULT 'anonymous';
ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT 'anonymous';

CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
