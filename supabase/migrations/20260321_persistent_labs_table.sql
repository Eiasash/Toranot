-- Persistent lab values keyed by patient identifier (name+room composite)
-- Survives shift archives — labs accumulate across on-call shifts.

CREATE TABLE IF NOT EXISTS toranot_labs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL DEFAULT '3f37c881-6e38-443b-a32d-f5eb9bd426cc',
  patient_key text NOT NULL,
  labs jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, patient_key)
);

CREATE INDEX IF NOT EXISTS idx_toranot_labs_user_key ON toranot_labs(user_id, patient_key);

ALTER TABLE toranot_labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own labs" ON toranot_labs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can insert labs" ON toranot_labs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Service role full access" ON toranot_labs FOR ALL TO service_role USING (true) WITH CHECK (true);
