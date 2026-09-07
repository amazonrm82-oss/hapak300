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

reset role; reset request.jwt.claim.sub;

-- ════════ RANK ORDER: ADMINISTRATOR ABOVE HQ-PARTY COMMANDER ════════
-- Both manage the unit; only the administrator may act on an administrator.
update people set auth_id='22222222-2222-2222-2222-222222222222' where pn='7387250';

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

select case when is_admin() and not is_sysadmin() then '✅' else '❌' end ||
       '  26  מפקד החפ״ק מנהל את היחידה אך אינו מנהל מערכת';

do $t$ begin
  update people set phone='052-9999999' where id=(select id from people_view where pn='7466718');
  raise notice '✅  27  מפקד החפ״ק עורך לוחם רגיל';
exception when others then
  raise notice '❌  27  מפקד החפ״ק נחסם מלערוך לוחם רגיל — %', sqlerrm;
end $t$;

do $t$ begin
  update people set phone='052-0000000' where id=(select id from people_view where pn='8409505');
  raise notice '❌  28  מפקד החפ״ק ערך מנהל מערכת — כשל אבטחה';
exception when others then
  raise notice '✅  28  מפקד החפ״ק נחסם מלערוך מנהל מערכת';
end $t$;

do $t$ begin
  update people set is_admin=true where id=me_id();
  raise notice '❌  29  מפקד החפ״ק מינה את עצמו למנהל מערכת — כשל אבטחה';
exception when others then
  raise notice '✅  29  מפקד החפ״ק נחסם ממינוי מנהל מערכת';
end $t$;

do $t$ begin
  insert into people (team_id, rank, name, role, pn, phone, rating, is_admin)
  values ('b','סרן','ניסיון הסלמה','מאבטח','7000001','052-5555555',7,true);
  raise notice '❌  30  מפקד החפ״ק הוסיף מנהל מערכת חדש — כשל אבטחה';
exception when others then
  raise notice '✅  30  מפקד החפ״ק נחסם מהוספת מנהל מערכת';
end $t$;

do $t$ begin
  delete from people where id=(select id from people_view where pn='8409505');
  raise notice '❌  31  מפקד החפ״ק הסיר מנהל מערכת — כשל אבטחה';
exception when others then
  raise notice '✅  31  מפקד החפ״ק נחסם מהסרת מנהל מערכת';
end $t$;

do $t$ begin
  perform reset_pin((select id from people_view where pn='8409505'));
  raise notice '❌  32  מפקד החפ״ק אפס את קוד מנהל המערכת — כשל אבטחה';
exception when others then
  raise notice '✅  32  מפקד החפ״ק נחסם מאיפוס קוד של מנהל מערכת';
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ AND THE OTHER DIRECTION ════════
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $t$ begin
  update people set phone='052-8888888' where id=(select id from people_view where pn='7387250');
  raise notice '✅  33  מנהל מערכת עורך את מפקד החפ״ק';
exception when others then
  raise notice '❌  33  מנהל מערכת נחסם מלערוך את מפקד החפ״ק — %', sqlerrm;
end $t$;

do $t$ begin
  update people set is_admin=true where id=(select id from people_view where pn='7241938');
  raise notice '✅  34  מנהל מערכת ממנה מנהל מערכת נוסף';
exception when others then
  raise notice '❌  34  מנהל מערכת נחסם ממינוי מנהל מערכת — %', sqlerrm;
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ INVITATIONS ════════
-- The CASE in invite_person/respond_invite yields text, and Postgres will not
-- cast text into an enum column on its own: without the explicit cast neither
-- issuing an invitation nor answering one worked at all.
insert into auth.users (id) values ('55555555-5555-5555-5555-555555555555');
update people set auth_id='55555555-5555-5555-5555-555555555555' where pn='7455120';

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $t$ begin
  perform invite_person((select id from trainings limit 1), 'instructor',
                        (select id from people_view where pn='7455120'));
  raise notice '✅  35  הזמנת מדריך נרשמה';
exception when others then
  raise notice '❌  35  הזמנת מדריך נכשלה — %', sqlerrm;
end $t$;

select case when (select inst_status from trainings limit 1)='pending'
            then '✅' else '❌' end || '  36  ההזמנה ממתינה למענה';

reset role; reset request.jwt.claim.sub;

set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role authenticated;

do $t$ begin
  perform respond_invite((select id from trainings limit 1), 'instructor', true);
  raise notice '✅  37  המדריך אישר את ההזמנה';
exception when others then
  raise notice '❌  37  אישור ההזמנה נכשל — %', sqlerrm;
end $t$;

select case when (select inst_status from trainings limit 1)='accepted'
            then '✅' else '❌' end || '  38  הסטטוס עודכן ל״אושר״';

do $t$ begin
  perform respond_invite((select id from trainings limit 1), 'commander', true);
  raise notice '❌  39  אושרה הזמנה של מישהו אחר — כשל אבטחה';
exception when others then
  raise notice '✅  39  אי אפשר לאשר הזמנה שאינה שלך';
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ THE LOGIN ROUTES ════════
-- The server writes pin_hash and auth_id with the service key, which carries
-- no JWT. The self-edit guard used to reject exactly that, the route ignored
-- the error, and every fighter was asked to choose a code again on every
-- login. `reset role` below is the closest local stand-in: no JWT, triggers
-- still firing.
reset role; reset request.jwt.claim.sub;

do $t$ begin
  update people set pin_hash = 'pbkdf2$210000$x$y', pin_set_at = now() where pn = '7466718';
  raise notice '✅  40  השרת שומר את הקוד שהלוחם בחר';
exception when others then
  raise notice '❌  40  שמירת הקוד נכשלה — % ← הלוחם יתבקש לבחור קוד בכל כניסה', sqlerrm;
end $t$;

select case when (select pin_hash from people where pn='7466718') is not null
            then '✅' else '❌' end || '  41  הקוד נשמר ובכניסה הבאה יידרש רק הקוד';

-- and a fighter still cannot set their own hash by hand
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;

do $t$ begin
  update people set pin_hash = 'pbkdf2$210000$a$b' where id = me_id();
  raise notice '❌  42  לוחם כתב לעצמו hash של קוד — כשל אבטחה';
exception when others then
  raise notice '✅  42  לוחם נחסם מלכתוב לעצמו קוד ישירות';
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ JOIN REQUESTS REACH THE LEADERSHIP ════════
-- Submitted from the login screen with no session at all, so the notification
-- is the database's job, not the browser's.
reset role; reset request.jwt.claim.sub;

insert into join_requests (name, rank, role, pn, phone, team_id)
values ('אורי בקשה', 'סמל', 'נגביסט', '7999999', '052-7777777', 'b');

select case when exists (
  select 1 from notifications n
   where n.text like 'בקשת הצטרפות חדשה%'
     and (select id from people where pn = '8409505') = any(n."to")
) then '✅' else '❌' end || '  43  בקשת הצטרפות מתריעה למנהל המערכת';

select case when exists (
  select 1 from notifications n
   where n.text like 'בקשת הצטרפות חדשה%'
     and (select id from people where pn = '7387250') = any(n."to")
) then '✅' else '❌' end || '  44  ובמקביל למפקד החפ״ק';

select case when not exists (
  select 1 from notifications n
   where n.text like 'בקשת הצטרפות חדשה%'
     and (select id from people where pn = '7480932') = any(n."to")
) then '✅' else '❌' end || '  45  לוחם רגיל אינו מקבל את ההתראה';

select case when (select n.text from notifications n where n.text like 'בקשת הצטרפות חדשה%' limit 1)
              like '%אורי בקשה%7999999%'
            then '✅' else '❌' end || '  46  ההתראה נושאת שם, תפקיד ומספר אישי';

-- ════════ SPEAKING WITH THE UNIT'S VOICE ════════
-- A notification lands in everyone's bell and on their lock screen. Only
-- someone who commands the thing being announced may write one.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;

do $t$ begin
  insert into notifications (text, "to") values ('האימון מחר בוטל', null);
  raise notice '❌  47  לוחם שלח הודעה לכל היחידה — כשל אבטחה';
exception when others then
  raise notice '✅  47  לוחם נחסם משליחת התראה ליחידה';
end $t$;

do $t$ begin
  perform notify('עקיפה דרך הפונקציה', null, null, 'general');
  raise notice '❌  48  לוחם קרא ל-notify ישירות — כשל אבטחה';
exception when others then
  raise notice '✅  48  הפונקציה notify אינה זמינה ללוחם';
end $t$;

reset role; reset request.jwt.claim.sub;

-- the team commander announcing their own training is exactly what it is for
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
do $t$ begin
  insert into notifications (text, "to", training_id)
  values ('שינוי בשעת היציאה', null, (select id from trainings limit 1));
  raise notice '✅  49  מפקד צוות שולח התראה על האימון שלו';
exception when others then
  raise notice '❌  49  מפקד צוות נחסם משליחת התראה — %', sqlerrm;
end $t$;
reset role; reset request.jwt.claim.sub;

-- ════════ THE OPEN JOIN FORM CANNOT BE USED AS A FIREHOSE ════════
do $t$ begin
  insert into join_requests (name, rank, role, pn, phone, team_id)
  values ('כפילות', 'סמל', 'מאבטח', '7999999', '', 'b');
  raise notice '❌  50  בקשה כפולה התקבלה';
exception when others then
  raise notice '✅  50  בקשה כפולה נדחית';
end $t$;

do $t$ begin
  insert into join_requests (name, rank, role, pn, phone, team_id)
  values ('כבר במערכת', 'סמל', 'מאבטח', '8409505', '', 'b');
  raise notice '❌  51  בקשה עבור מספר אישי קיים התקבלה';
exception when others then
  raise notice '✅  51  בקשה עבור מספר אישי שכבר במערכת נדחית';
end $t$;

do $t$ begin
  insert into join_requests (name, rank, role, pn, phone, team_id)
  values ('קצר', 'סמל', 'מאבטח', '123', '', 'b');
  raise notice '❌  52  מספר אישי לא תקין התקבל';
exception when others then
  raise notice '✅  52  מספר אישי לא תקין נדחה';
end $t$;

-- ════════ THE RATE LIMITER ════════
select case when bump_rate_limit('test:key', 3, 600)
             and bump_rate_limit('test:key', 3, 600)
             and bump_rate_limit('test:key', 3, 600)
            then '✅' else '❌' end || '  53  שלוש הפניות הראשונות מותרות';
select case when not bump_rate_limit('test:key', 3, 600)
            then '✅' else '❌' end || '  54  הפנייה הרביעית נחסמת';
select case when bump_rate_limit('test:other', 3, 600)
            then '✅' else '❌' end || '  55  מגבלה נספרת בנפרד לכל קורא';
