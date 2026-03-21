-- Token usage tracking: increment monthly counters per provider
-- Called fire-and-forget from claude.ts and gemini.ts after each API call.
-- Uses upsert on toranot_config with key = 'token_usage_YYYY-MM_provider'

CREATE OR REPLACE FUNCTION increment_token_usage(
  p_month text,
  p_provider text,
  p_input int,
  p_output int
) RETURNS void AS $$
DECLARE
  config_key text := 'token_usage_' || p_month || '_' || p_provider;
  current_val jsonb;
BEGIN
  SELECT value::jsonb INTO current_val
  FROM toranot_config
  WHERE key = config_key;

  IF current_val IS NULL THEN
    -- First call this month for this provider
    INSERT INTO toranot_config (key, value, updated_at)
    VALUES (
      config_key,
      jsonb_build_object(
        'month', p_month,
        'provider', p_provider,
        'input_tokens', p_input,
        'output_tokens', p_output,
        'call_count', 1
      )::text,
      NOW()
    )
    ON CONFLICT (key) DO UPDATE SET
      value = jsonb_build_object(
        'month', p_month,
        'provider', p_provider,
        'input_tokens', p_input,
        'output_tokens', p_output,
        'call_count', 1
      )::text,
      updated_at = NOW();
  ELSE
    UPDATE toranot_config SET
      value = jsonb_build_object(
        'month', p_month,
        'provider', p_provider,
        'input_tokens', (current_val->>'input_tokens')::int + p_input,
        'output_tokens', (current_val->>'output_tokens')::int + p_output,
        'call_count', (current_val->>'call_count')::int + 1
      )::text,
      updated_at = NOW()
    WHERE key = config_key;
  END IF;
END;
$$ LANGUAGE plpgsql;
