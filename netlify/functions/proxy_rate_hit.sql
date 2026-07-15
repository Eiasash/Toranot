-- Supabase migration backing netlify/functions/_utils.ts::checkRateLimit.
-- Applied to Supabase project krmlzwwelqvlfslwltol ("Toranot") on 2026-07-15
-- via the Supabase management API (migration name: proxy_rate_limiter_counters).
-- Recorded here for provenance / reproducibility. Convention mirrors app_users /
-- textbook_chapters / toranot_config: RLS deny-all + SECURITY DEFINER RPC,
-- EXECUTE granted only to service_role (the key the edge proxy already uses).
-- Supersedes the older public-writable public.proxy_rate_limits table.

create table if not exists public.proxy_rate_counters (
  bucket      text primary key,
  count       integer not null default 0,
  expires_at  timestamptz not null default (now() + interval '1 minute')
);

comment on table public.proxy_rate_counters is
  'Fixed-window counters for the /api/claude proxy rate limiter. Written ONLY by the edge function via proxy_rate_hit() (SECURITY DEFINER, service_role). RLS deny-all; no client access. Supersedes the older public-writable proxy_rate_limits table.';

create index if not exists idx_proxy_rate_counters_expires
  on public.proxy_rate_counters (expires_at);

alter table public.proxy_rate_counters enable row level security;
-- No policies => deny-all for anon/authenticated; service_role bypasses RLS.

-- Atomic multi-bucket fixed-window increment. Parallel arrays of bucket keys and
-- TTL seconds; increments each (resetting when its window expired) and returns
-- the post-increment counts in order. One round-trip; each row serialized by its
-- own row lock => correct under concurrency.
create or replace function public.proxy_rate_hit(p_keys text[], p_ttls integer[])
returns integer[]
language plpgsql
security definer
set search_path = public
as $$
declare
  i        integer;
  v_count  integer;
  v_result integer[] := '{}';
  v_now    timestamptz := now();
begin
  if p_keys is null or array_length(p_keys, 1) is null then
    return '{}';
  end if;
  for i in 1 .. array_length(p_keys, 1) loop
    insert into public.proxy_rate_counters as c (bucket, count, expires_at)
      values (p_keys[i], 1, v_now + make_interval(secs => greatest(coalesce(p_ttls[i], 60), 1)))
    on conflict (bucket) do update
      set count      = case when c.expires_at <= v_now then 1 else c.count + 1 end,
          expires_at = case when c.expires_at <= v_now then v_now + make_interval(secs => greatest(coalesce(p_ttls[i], 60), 1)) else c.expires_at end
      returning c.count into v_count;
    v_result := array_append(v_result, v_count);
  end loop;
  -- Opportunistic cleanup (~1% of calls) bounds table growth from idle buckets.
  if random() < 0.01 then
    delete from public.proxy_rate_counters where expires_at < v_now - interval '1 hour';
  end if;
  return v_result;
end;
$$;

revoke all on function public.proxy_rate_hit(text[], integer[]) from public;
revoke all on function public.proxy_rate_hit(text[], integer[]) from anon;
revoke all on function public.proxy_rate_hit(text[], integer[]) from authenticated;
grant execute on function public.proxy_rate_hit(text[], integer[]) to service_role;
