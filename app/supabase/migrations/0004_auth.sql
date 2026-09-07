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

-- Clearing the PIN sends the fighter back through "choose a code" on next login.
create or replace function reset_pin(pid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'איפוס קוד כניסה שמור למנהל המערכת ולמפקד החפ״ק';
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
