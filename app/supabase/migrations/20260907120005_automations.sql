-- ═══════════════════════════════════════════════════════════════════════════
-- Automations: the reminders the unit asked for, sent once each.
-- The cron job calls the `run-automations` Edge Function every 10 minutes.
-- ═══════════════════════════════════════════════════════════════════════════

-- `notifications.kind` and `notifications.pushed_at` are created in 0001; the
-- reminder bookkeeping tables are the service role's alone — no policy means no
-- access for ordinary sessions, which is the intent.

-- pg_cron and pg_net are enabled from the dashboard on hosted Supabase
-- (Database → Extensions). Enabling them from a migration needs privileges the
-- migration role does not always have, so a failure here is a notice, not a
-- broken deploy — the schedule in the comment below is set up separately anyway.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron לא הופעל מכאן — הפעל אותו מהדשבורד: Database → Extensions';
end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net לא הופעל מכאן — הפעל אותו מהדשבורד: Database → Extensions';
end $$;

/*
  Scheduling the job needs the project URL and the service-role key, which must
  not be written into a migration. Run this once from the SQL editor, with your
  own values substituted — see README.md, "הפעלת האוטומציות":

    select cron.schedule(
      'hapak-automations',
      '*/10 * * * *',
      $$
      select net.http_post(
        url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/run-automations',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
        body    := '{}'::jsonb
      );
      $$
    );

  To stop it:  select cron.unschedule('hapak-automations');
  To inspect:  select * from cron.job;
*/
