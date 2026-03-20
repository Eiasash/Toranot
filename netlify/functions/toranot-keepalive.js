// Scheduled function: pings Supabase every 5 days to prevent free-tier hibernation.
// [functions.toranot-keepalive]
// schedule = "0 6 */5 * *"
import { createClient } from '@supabase/supabase-js';

export async function handler() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { statusCode: 500, body: "Missing Supabase credentials" };
  }

  const supabase = createClient(url, key);

  const { error } = await supabase.from('toranot_config')
    .upsert({
      key: 'keepalive_last',
      value: JSON.stringify(new Date().toISOString()),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (error) {
    console.error("Keepalive failed:", error.message);
    return { statusCode: 500, body: error.message };
  }

  return { statusCode: 200, body: "ok" };
}
