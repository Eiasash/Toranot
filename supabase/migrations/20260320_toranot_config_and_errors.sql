CREATE TABLE IF NOT EXISTS toranot_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT NOW()
);
INSERT INTO toranot_config (key, value) VALUES
  ('claude_model', '"claude-sonnet-4-20250514"'),
  ('claude_model_updated_at', '"2026-03-20"'),
  ('monthly_token_usage', '{"input":0,"output":0,"month":"2026-03","cost_usd":0}'),
  ('keepalive_last', '"2026-03-20T00:00:00Z"'),
  ('payload_schema_version', '"v1"'),
  ('app_version', '"current"'),
  ('bundle_size_kb', '138'),
  ('test_count', '1588')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
CREATE TABLE IF NOT EXISTS toranot_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'error',
  source text,
  message text NOT NULL,
  payload jsonb,
  app_version text,
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS toranot_errors_created_at ON toranot_errors(created_at DESC);
