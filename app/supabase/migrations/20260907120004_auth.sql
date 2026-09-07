-- ═══════════════════════════════════════════════════════════════════════════
-- Login support: PIN reset, and throttling. A four-digit PIN is only 10,000
-- possibilities, so the rate limit — not the hash — is what actually protects
-- an account. The hash still matters if the database is ever copied.
-- ═══════════════════════════════════════════════════════════════════════════

create table login_attempts (
  pn         text primary key,
  failures   int not null default 0,
  locked_until timestamptz,
  last_try   timestamptz not null default now()
);
alter table login_attempts enable row level security;  -- service role only

-- A per-account lock stops someone guessing one fighter's code. It does not
-- stop someone walking the whole 7-digit space from one machine, learning which
-- numbers exist. This is the ceiling for that: counted per caller, not per
-- account, and written only by the server routes.
create table rate_limits (
  key       text primary key,
  hits      int not null default 0,
  window_at timestamptz not null default now()
);
alter table rate_limits enable row level security;  -- service role only

-- Returns true while the caller is still inside their allowance. One statement,
-- so two requests arriving together cannot both read the same count.
create or replace function bump_rate_limit(k text, max_hits int, window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare cur rate_limits;
begin
  insert into rate_limits (key, hits, window_at) values (k, 1, now())
  on conflict (key) do update set
    hits = case when rate_limits.window_at < now() - make_interval(secs => window_seconds)
                then 1 else rate_limits.hits + 1 end,
    window_at = case when rate_limits.window_at < now() - make_interval(secs => window_seconds)
                then now() else rate_limits.window_at end
  returning * into cur;

  -- keep the table from growing without bound; the rows are worthless once cold
  delete from rate_limits where window_at < now() - interval '1 day';

  return cur.hits <= max_hits;
end $$;

grant execute on function bump_rate_limit(text, int, int) to service_role;

-- Clearing the PIN sends the fighter back through "choose a code" on next login.
create or replace function reset_pin(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'איפוס קוד כניסה שמור למנהל המערכת ולמפקד החפ״ק';
  end if;
  -- resetting a code is a way into the account, so the rank order holds here too
  if not is_sysadmin() and (select is_admin from people where id = pid) then
    raise exception 'רק מנהל מערכת יכול לאפס את קוד הכניסה של מנהל מערכת';
  end if;
  update people set pin_hash = null, pin_set_at = null where id = pid;
  delete from login_attempts where pn = (select pn from people where id = pid);
end $$;

grant execute on function reset_pin(uuid) to authenticated;

-- Notification preferences are the one thing a fighter changes about themselves.
create or replace function set_my_notif(prefs jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update people set notif = prefs where id = me_id();
end $$;

grant execute on function set_my_notif(jsonb) to authenticated;
