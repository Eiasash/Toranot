CREATE TABLE IF NOT EXISTS toranot_patients_backup (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  state jsonb NOT NULL,
  snapshot_reason text DEFAULT 'auto',
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS toranot_backup_user_created
  ON toranot_patients_backup(user_id, created_at DESC);
