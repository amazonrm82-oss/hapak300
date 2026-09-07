-- ═══════════════════════════════════════════════════════════════════════════
--  עדכון 3, חלק ב׳ — צוות "סדיר"
--
--  להריץ **אחרי** patch-03a. בטוח להריץ שוב ושוב.
--
--  סדיר אינו מתאמן לבד: הוא מצטרף לכל אימון של צוות א׳ או צוות ב׳. לכן חבריו
--  מקבלים זימון, מסמנים נוכחות, נספרים במזון, במקומות ברכב ובתחמושת — בכל
--  אימון — אבל אי אפשר ליצור אימון שהוא "של סדיר" בלבד.
--
--  זה נשען על דגל `attends_all` בטבלת הצוותים, כך שאפשר יהיה להגדיר בעתיד עוד
--  צוות שמתנהג כך בלי לגעת בקוד.
-- ═══════════════════════════════════════════════════════════════════════════

alter table teams add column if not exists attends_all boolean not null default false;

insert into teams (id, name, attends_all) values ('c', 'סדיר', true)
on conflict (id) do update set attends_all = true;

create or replace function training_participants(tid uuid)
returns setof people
language sql stable security definer set search_path = public as $$
  select p.* from people p, trainings t
  where t.id = tid and p.status = 'active' and p.team_id is not null
    and (t.team_id = 'joint'
         or p.team_id::text = t.team_id::text
         or exists (select 1 from teams tm where tm.id = p.team_id and tm.attends_all))
$$;

create or replace function is_participant(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trainings t
    where t.id = tid
      and (t.team_id = 'joint' or t.team_id::text = my_team()::text
           or t.instructor_id = me_id() or t.commander_id = me_id()
           or exists (select 1 from teams tm where tm.id = my_team() and tm.attends_all))
  )
$$;

-- לבדיקה:
--   select id, name, attends_all from teams;
--   select count(*) from training_participants((select id from trainings limit 1));
