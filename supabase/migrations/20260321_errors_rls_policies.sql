-- Allow error inserts from client-side error reporter
-- errorReporter.ts uses anon key for pre-auth errors and auth token for post-login

CREATE POLICY "Allow authenticated error inserts"
  ON toranot_errors FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anon error inserts"
  ON toranot_errors FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow service read errors"
  ON toranot_errors FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Allow authenticated read errors"
  ON toranot_errors FOR SELECT
  TO authenticated
  USING (true);
