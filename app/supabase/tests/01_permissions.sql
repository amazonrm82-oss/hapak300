\set ON_ERROR_STOP off
\pset border 2
\t on

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444');
update people set auth_id='11111111-1111-1111-1111-111111111111' where pn='8409505';

-- ════════ AS THE ADMINISTRATOR ════════
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select case when is_admin() then '✅' else '❌' end || '  01  מנהל מזוהה כמנהל';

insert into people (team_id, rank, name, role, pn, phone, rating, is_team_commander)
values ('a','סרן','יואב ברק','מפקד צוות','7241938','052-1111111',9,true);
insert into people (team_id, rank, name, role, pn, phone, rating)
values ('a','סמל','דניאל כץ','נהג','7466718','052-2222222',7),
       ('a','סמל','איתי רוזן','חובש','7455120','052-3333333',7),
       ('a','רב״ט','תומר גל','מאבטח','7480932','052-4444444',6);
select case when count(*)=6 then '✅' else '❌' end || '  02  מנהל מוסיף לוחמים  (' || count(*) || ')' from people_view;

update teams set commander_id=(select id from people_view where pn='7241938') where id='a';
update people set phone='052-1111999' where id=(select id from people_view where pn='7241938');
select case when (select phone from people_view where pn='7241938')='052-1111999'
            then '✅' else '❌' end || '  03  עריכת לוחם  ← הבאג שתוקן';

select case when count(*)=1 then '✅' else '❌' end || '  04  יצירת אימון עם לוגיסטיקה'
from create_trainings(jsonb_build_array(jsonb_build_object(
  'team_id','a','topic_id','setup','date',(current_date+7)::text,
  'start_time','07:00','end_time','17:00','location','שטח אימונים ״רמה״',
  'commander_id',(select id from people_view where pn='7241938')::text,
  'instructor_id',(select id from people_view where pn='7466718')::text,
  'status','published','departure','05:30',
  'day_blocks', jsonb_build_array(jsonb_build_object('time','07:00','title','התכנסות ומסדר')),
  'gear', jsonb_build_array(jsonb_build_object('name','מכשירי קשר','qty',6)),
  'vehicles', jsonb_build_array(jsonb_build_object('type','האמר','tz','612345','seats',6,'departure','05:30')),
  'ammo', jsonb_build_array(jsonb_build_object('weapon','רימוני עשן','per_fighter',0,'allocated',4)),
  'food', jsonb_build_array(jsonb_build_object('name','מים','qty',40,'unit','ליטר','note',''))
)), false);

select case when (select seq from trainings_view limit 1)=1 then '✅' else '❌' end || '  05  מספר אימון רץ (seq) מחושב';
select case when (select count(*) from gear_items)=1 and (select count(*) from vehicles)=1
             and (select count(*) from ammo)=1 and (select count(*) from food)=1
            then '✅' else '❌' end || '  06  ציוד, רכב, תחמושת ומזון נוצרו';
select case when (select evac_vehicle_id is not null and medic_id is not null from trainings limit 1)
            then '✅' else '❌' end || '  07  רכב פינוי וחובש תורן שובצו אוטומטית';
reset role; reset request.jwt.claim.sub;
select case when (select count(*) from notifications where kind='changed')>=1
            then '✅' else '❌' end || '  08  התראת ״אימון חדש פורסם״ נשלחה';
select case when (select count(*) from notifications where kind='changed'
                   and (select id from people where pn='7466718') = any("to"))>=1
            then '✅' else '❌' end || '  08b ההתראה מופנית ללוחמי הצוות';
update people set auth_id='33333333-3333-3333-3333-333333333333' where pn='7466718';
update people set auth_id='44444444-4444-4444-4444-444444444444' where pn='7241938';

-- ════════ AS AN ORDINARY FIGHTER ════════
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;

select case when not is_admin() and not is_team_cmd() then '✅' else '❌' end || '  09  לוחם אינו מנהל ואינו מפקד צוות';
select case when (select pn from people_view where name='יואב ברק')=''
            then '✅' else '❌' end || '  10  מספר אישי של אחר מוסתר מלוחם';
select case when (select pn from people_view where name='דניאל כץ')='7466718'
            then '✅' else '❌' end || '  11  הלוחם רואה את המספר האישי של עצמו';

-- the fighter marks their own attendance
insert into attendance (training_id, person_id, status, reason)
values ((select id from trainings limit 1), me_id(), 'coming', '');
select case when count(*)=1 then '✅' else '❌' end || '  12  לוחם מסמן נוכחות לעצמו' from attendance;

do $t$ begin
  update attendance set approved=true where person_id=me_id();
  raise notice '❌  13  לוחם הצליח לאשר נוכחות של עצמו — כשל אבטחה';
exception when others then
  raise notice '✅  13  לוחם נחסם מלאשר נוכחות של עצמו';
end $t$;

do $t$ begin
  update attendance set rating=10 where person_id=me_id();
  raise notice '❌  14  לוחם הצליח לדרג את עצמו — כשל אבטחה';
exception when others then
  raise notice '✅  14  לוחם נחסם מלדרג את עצמו';
end $t$;

do $t$ begin
  insert into attendance (training_id, person_id, status, reason)
  values ((select id from trainings limit 1), (select id from people_view where pn='7480932'), 'coming','');
  raise notice '❌  15  לוחם סימן נוכחות של אחר — כשל אבטחה';
exception when others then
  raise notice '✅  15  לוחם נחסם מלסמן נוכחות של אחר';
end $t$;

do $t$ begin
  insert into attendance (training_id, person_id, status, reason)
  values ((select id from trainings limit 1), me_id(), 'absent', '');
  raise notice '❌  16  ״לא מגיע״ ללא סיבה התקבל — כשל';
exception when others then
  raise notice '✅  16  ״לא מגיע״ ללא סיבה נדחה';
end $t$;

do $t$ begin
  update people set is_admin=true where id=me_id();
  raise notice '❌  17  לוחם העניק לעצמו הרשאת מנהל — כשל אבטחה';
exception when others then
  raise notice '✅  17  לוחם נחסם מלהעניק לעצמו הרשאות';
end $t$;

do $t$ begin
  perform approve_attendance((select id from trainings limit 1));
  raise notice '❌  18  לוחם אישר נוכחות סופית — כשל אבטחה';
exception when others then
  raise notice '✅  18  לוחם נחסם מאישור נוכחות סופי';
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ AS THE TEAM COMMANDER ════════
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;

select case when is_team_cmd() then '✅' else '❌' end || '  19  מפקד הצוות מזוהה';
select case when (select pn from people_view where name='דניאל כץ')='7466718'
            then '✅' else '❌' end || '  20  מפקד רואה מספרים אישיים';

select approve_attendance((select id from trainings limit 1));
select case when count(*)=4 then '✅' else '❌' end ||
       '  21  אישור סופי — מי שלא הגיב נרשם ״לא מגיע״  (' || count(*) || ' שורות)'
from attendance;
select case when count(*)=3 then '✅' else '❌' end || '  22  שלושה שלא הגיבו סומנו אוטומטית'
from attendance where auto;
select case when (select status from attendance where person_id=(select id from people_view where pn='7466718'))='coming'
            then '✅' else '❌' end || '  23  מי שכן סימן — הסטטוס שלו נשמר';
select case when (select approved_all from trainings limit 1) then '✅' else '❌' end || '  24  האימון סומן כמאושר';

select reopen_attendance((select id from trainings limit 1));
select case when count(*)=1 then '✅' else '❌' end || '  25  פתיחה מחדש מוחקת את הסימונים האוטומטיים'
from attendance;
