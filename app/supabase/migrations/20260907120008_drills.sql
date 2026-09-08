-- ═══════════════════════════════════════════════════════════════════════════
-- מקצים — the stations a training is actually made of.
--
-- A shooting day is not one thing: it is ירי בעמידה, ירי בתנועה, החלפת מחסנית.
-- Each is run, each is measured per fighter, and the training's result is what
-- those add up to. Until now a training had attendance and a commander's
-- impression, and nothing in between.
-- ═══════════════════════════════════════════════════════════════════════════

-- How a drill is scored. 'hits' counts rounds fired against rounds on target —
-- the score writes itself. 'score' is a number the instructor judges directly,
-- for a station that has no hit count. 'passfail' is the same thing with two
-- values, kept separate so a screen can show it as a checkbox.
create type drill_kind as enum ('hits', 'score', 'passfail');

create table drills (
  id          uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  name        text not null,
  description text not null default '',
  kind        drill_kind not null default 'hits',
  -- what a fighter is expected to fire, so the form can prefill and the
  -- ammunition plan has something to be checked against
  rounds      int not null default 0 check (rounds >= 0),
  -- a station that matters more than another: 2 counts double in the average
  weight      numeric(4, 2) not null default 1 check (weight > 0 and weight <= 10),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index drills_training_idx on drills (training_id);
create trigger drills_updated before update on drills
  for each row execute function set_updated_at();

create table drill_results (
  id         uuid primary key default gen_random_uuid(),
  drill_id   uuid not null references drills (id) on delete cascade,
  person_id  uuid not null references people (id) on delete cascade,
  shots      int check (shots is null or shots >= 0),
  hits       int check (hits is null or hits >= 0),
  -- 0–100. Written by the trigger below for a 'hits' drill, entered directly
  -- otherwise; kept as a column so the archive does not depend on the formula.
  score      numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  note       text not null default '',
  by_id      uuid references people (id) on delete set null,
  at         timestamptz not null default now(),
  unique (drill_id, person_id)
);
create index drill_results_drill_idx on drill_results (drill_id);
create index drill_results_person_idx on drill_results (person_id);

-- A hit count and a score are the same fact stated twice; the database decides
-- which one wins so two screens can never disagree about it.
create or replace function set_drill_score() returns trigger
language plpgsql set search_path = public as $$
declare k drill_kind;
begin
  select kind into k from drills where id = new.drill_id;

  if k = 'hits' then
    if new.hits is not null and new.shots is not null and new.shots > 0 then
      if new.hits > new.shots then
        raise exception 'לא ייתכן שמספר הפגיעות גדול ממספר הכדורים שנורו';
      end if;
      new.score := round((100.0 * new.hits) / new.shots, 2);
    else
      new.score := null;
    end if;
  elsif k = 'passfail' then
    new.score := case when new.score is null then null
                      when new.score >= 50 then 100 else 0 end;
  end if;

  return new;
end $$;

create trigger drill_results_score before insert or update on drill_results
  for each row execute function set_drill_score();

-- ── who may see and record ─────────────────────────────────────────────────
alter table drills        enable row level security;
alter table drill_results enable row level security;

-- the drills themselves are part of the training plan: everyone taking part
-- sees them, the people who run the training write them
create policy drills_read on drills for select to authenticated
  using (is_participant(training_id) or is_admin());
create policy drills_write on drills for all to authenticated
  using (can_edit_training(training_id))
  with check (can_edit_training(training_id));

-- a fighter sees their own result and nobody else's, exactly as with
-- attendance; whoever runs the training sees and records the lot
create policy drill_results_read on drill_results for select to authenticated
  using (
    person_id = me_id()
    or sees_list((select training_id from drills where id = drill_id))
  );
create policy drill_results_write on drill_results for all to authenticated
  using (can_edit_training((select training_id from drills where id = drill_id)))
  with check (can_edit_training((select training_id from drills where id = drill_id)));

alter publication supabase_realtime add table drills;
alter publication supabase_realtime add table drill_results;

-- ── the commander's grade for the training itself ──────────────────────────
alter table trainings add column if not exists grade      int
  check (grade is null or grade between 0 and 100);
alter table trainings add column if not exists grade_note text not null default '';

comment on column trainings.grade is
  'ציון המפקד לאימון כולו, 0–100. ציון המקצים מחושב בנפרד מהתוצאות.';


-- ── the training view has to be rebuilt around the new columns ─────────────
--
-- A view stores the column list it was created with: `t.*` was expanded once,
-- so `trainings_view` does not gain `grade` on its own — the client would never
-- see it. And `create or replace` cannot insert a column before `seq`, so the
-- view is dropped and rebuilt rather than replaced.
drop view if exists trainings_view;
create view trainings_view as
select t.*, coalesce(s.seq, 0) as seq
from trainings t
left join trainings_seq s on s.id = t.id
where me_id() is not null or auth.uid() is null;

grant select on trainings_view to authenticated;

-- Recording a grade is the training commander's, the team commander's or an
-- administrator's — the same people who approve the attendance.
create or replace function set_training_grade(tid uuid, value int, note text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or is_training_cmd(tid) or can_approve_training(tid)) then
    raise exception 'מתן ציון לאימון שמור למפקד האימון ולמפקד הצוות';
  end if;
  if value is not null and (value < 0 or value > 100) then
    raise exception 'ציון האימון חייב להיות בין 0 ל-100';
  end if;
  update trainings set grade = value, grade_note = coalesce(note, '') where id = tid;
end $$;

grant execute on function set_training_grade(uuid, int, text) to authenticated;
