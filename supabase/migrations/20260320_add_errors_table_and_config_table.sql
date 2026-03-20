-- Applied directly to Supabase 2026-03-20
CREATE TABLE IF NOT EXISTS errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'error',
  source text,
  message text NOT NULL,
  payload jsonb,
  app_version text,
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS errors_created_at_idx ON errors(created_at DESC);
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT NOW()
);
INSERT INTO app_config (key, value) VALUES
  ('claude_model', '"claude-sonnet-4-20250514"'),
  ('claude_model_updated_at', '"2026-03-20"'),
  ('monthly_token_usage', '{"input":0,"output":0,"month":"2026-03","cost_usd":0}'),
  ('supabase_keepalive_last', '"2026-03-20T00:00:00Z"'),
  ('payload_schema_version', '"v1"'),
  ('outfit_quality_baseline', '{"avg_score":0,"sample_count":0,"since":"2026-03-20"}'),
  ('app_version', '"phase6-complete"'),
  ('wardrobe_health_threshold', '{"max_per_category":25,"min_wear_rate":0.30}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
