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

-- ════════ ENDING A SESSION THAT IS ALREADY OPEN ════════
-- Resetting a code used to leave the phone in someone's pocket signed in, and
-- deactivating a fighter only blocked the next login.
reset role; reset request.jwt.claim.sub;
select set_config('request.jwt.claims', '{"iat":1000000}', false);

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select case when me_id() is not null then '✅' else '❌' end || '  56  טוקן תקין מזוהה';
reset role; reset request.jwt.claim.sub;

-- the commander revokes that fighter's devices
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select revoke_sessions((select id from people_view where pn = '7466718'));
reset role; reset request.jwt.claim.sub;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select case when me_id() is null then '✅' else '❌' end ||
       '  57  הטוקן הישן נדחה מיד אחרי ניתוק המכשירים';
select case when (select count(*) from attendance) = 0 then '✅' else '❌' end ||
       '  58  ובלי זהות אין גישה לנתוני היחידה';
reset role; reset request.jwt.claim.sub;

-- a deactivated fighter loses access without anyone revoking anything
update people set status = 'inactive' where pn = '7480932';
insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666');
update people set auth_id = '66666666-6666-6666-6666-666666666666' where pn = '7480932';

set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role authenticated;
select case when me_id() is null then '✅' else '❌' end ||
       '  59  לוחם שהושבת מאבד גישה גם אם הוא כבר מחובר';
reset role; reset request.jwt.claim.sub;

-- ════════ THE AUDIT LOG ════════
select case when exists (
  select 1 from audit_log where entity = 'people' and action = 'הוספה' and subject like '%יואב ברק%'
) then '✅' else '❌' end || '  60  הוספת לוחם נרשמה ביומן';

select case when exists (
  select 1 from audit_log where entity = 'people' and detail like '%מונה מנהל מערכת%'
) then '✅' else '❌' end || '  61  מינוי הרשאה נרשם ביומן';

select case when exists (
  select 1 from audit_log where entity = 'people' and detail like '%ניתוק כל המכשירים%'
) then '✅' else '❌' end || '  62  ניתוק מכשירים נרשם ביומן';

select case when exists (
  select 1 from audit_log where entity = 'trainings' and action = 'הוספה'
) then '✅' else '❌' end || '  63  יצירת אימון נרשמה ביומן';

-- the log is the leadership's, and nobody may rewrite it
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
-- a delete with no privilege raises; with a privilege but no policy it would
-- quietly affect nothing, so check the rows are still there either way
do $t$
declare before int; after int;
begin
  select count(*) into before from audit_log;
  begin
    delete from audit_log;
  exception when others then null;
  end;
  select count(*) into after from audit_log;
  if after = before and before > 0 then
    raise notice '✅  64  היומן שרד ניסיון מחיקה';
  else
    raise notice '❌  64  היומן נמחק — כשל אבטחה (% → %)', before, after;
  end if;
end $t$;
do $t$ begin
  insert into audit_log (action, entity, subject) values ('הוספה', 'people', 'רשומה מזויפת');
  raise notice '❌  65  נכתבה רשומה מזויפת ליומן — כשל אבטחה';
exception when others then
  raise notice '✅  65  אי אפשר לכתוב ליומן ידנית';
end $t$;
reset role; reset request.jwt.claim.sub;

-- a revoked or deactivated token must not read the roster either: the views
-- run as their owner, so the policies on `people` never see them
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role authenticated;
select case when (select count(*) from people_view) = 0 then '✅' else '❌' end ||
       '  66  לוחם מושבת אינו קורא את רשימת היחידה';
select case when (select count(*) from trainings_view) = 0 then '✅' else '❌' end ||
       '  67  ואינו רואה את לו״ז האימונים';
reset role; reset request.jwt.claim.sub;

-- ════════ WHAT A FIGHTER CARRIES IS THE COMMANDER'S TO SET ════════
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;
do $t$ begin
  update people set medical_profile = 45, weapon = 'M4', weapon_serial = 'X1'
   where id = (select id from people_view where pn = '7455120');
  raise notice '✅  69  מפקד מזין נשק אישי ופרופיל רפואי';
exception when others then
  raise notice '❌  69  המפקד נחסם — %', sqlerrm;
end $t$;
reset role; reset request.jwt.claim.sub;

-- 7455120 is the fighter whose devices were revoked earlier, so use a token
-- issued after that revocation
select set_config('request.jwt.claims', '{"iat":4000000000}', false);
insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777');
update people set auth_id = '77777777-7777-7777-7777-777777777777' where pn = '7455120';
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role authenticated;

do $t$ begin
  update people set medical_profile = 97 where id = me_id();
  raise notice '❌  70  לוחם שינה לעצמו פרופיל רפואי — כשל';
exception when others then
  raise notice '✅  70  לוחם נחסם משינוי הפרופיל הרפואי של עצמו';
end $t$;

do $t$ begin
  update people set weapon_serial = 'זיוף' where id = me_id();
  raise notice '❌  71  לוחם שינה לעצמו מספר נשק — כשל';
exception when others then
  raise notice '✅  71  לוחם נחסם משינוי מספר הנשק של עצמו';
end $t$;

select case when (select weapon_serial from people_view where id = me_id()) = 'X1'
            then '✅' else '❌' end || '  72  הלוחם רואה את מספר הנשק של עצמו';
-- addressed by name: this fighter cannot see anyone else's personal number
-- either, so `where pn = …` would match nothing and prove nothing
select case when (select weapon_serial from people_view where name = 'דניאל כץ') = ''
            then '✅' else '❌' end || '  73  ומספר הנשק של אחר מוסתר ממנו';
reset role; reset request.jwt.claim.sub;

-- ════════ CLOSING A PERIOD ════════
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
do $t$ begin
  perform close_period('קיץ 2026', (current_date + 30)::date, '');
  raise notice '❌  74  לוחם סגר תקופה — כשל אבטחה';
exception when others then
  raise notice '✅  74  לוחם נחסם מסגירת תקופה';
end $t$;
reset role; reset request.jwt.claim.sub;

-- the seeded period starts a month out; move it behind the test training so
-- the closing summary has something to count
update settings set period_start = current_date - 7 where id;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $t$ begin
  perform close_period('קיץ 2026', (select period_start from settings), '');
  raise notice '❌  75  תקופה חדשה שמתחילה לפני הקודמת התקבלה';
exception when others then
  raise notice '✅  75  תאריך התחלה לא תקין נדחה';
end $t$;

select close_period('קיץ 2026', (current_date + 30)::date, 'סיום תקופת חורף') is not null;
select case when (select period_name from settings) = 'קיץ 2026'
            then '✅' else '❌' end || '  76  התקופה החדשה נפתחה';
select case when (select count(*) from periods) = 1
            then '✅' else '❌' end || '  77  התקופה שנסגרה נשמרה בארכיון';
select case when jsonb_array_length((select summary from periods limit 1)) > 0
            then '✅' else '❌' end || '  78  הסיכום כולל שורה לכל לוחם';
select case when (select trainings from periods limit 1) >= 1
            then '✅' else '❌' end || '  79  מספר האימונים בתקופה נספר';
reset role; reset request.jwt.claim.sub;

-- ════════ סדיר: מצטרף לכל אימון, ולעולם לא מתאמן לבד ════════
reset role; reset request.jwt.claim.sub;

insert into people (team_id, rank, name, role, pn, phone, rating)
values ('c', 'רב״ט', 'עומר סדיר', 'מאבטח', '7300001', '052-8888888', 7);

select case when (select count(*) from training_participants((select id from trainings limit 1))
                   where pn = '7300001') = 1
            then '✅' else '❌' end || '  80  לוחם סדיר משובץ לאימון של צוות א׳';

select case when (select attends_all from teams where id = 'c')
            then '✅' else '❌' end || '  81  סדיר מסומן כמצטרף לכל אימון';

-- and the invitation reaches them: the published-training notification is
-- addressed to the participants, סדיר included
insert into auth.users (id) values ('88888888-8888-8888-8888-888888888888');
update people set auth_id = '88888888-8888-8888-8888-888888888888' where pn = '7300001';
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
set role authenticated;

select case when is_participant((select id from trainings limit 1))
            then '✅' else '❌' end || '  82  ומזוהה כמשתתף — נוכחות, צ׳אט וזימון';

do $t$ begin
  insert into attendance (training_id, person_id, status, reason)
  values ((select id from trainings limit 1), me_id(), 'coming', '');
  raise notice '✅  83  לוחם סדיר מסמן נוכחות באימון של צוות א׳';
exception when others then
  raise notice '❌  83  לוחם סדיר נחסם מסימון נוכחות — %', sqlerrm;
end $t$;

reset role; reset request.jwt.claim.sub;

-- a training can only belong to א׳, ב׳ or both — never to סדיר alone
do $t$ begin
  insert into trainings (team_id, topic_id, date, start_time, end_time)
  values ('c', 'setup', current_date + 20, '07:00', '17:00');
  raise notice '❌  84  נוצר אימון של סדיר בלבד — לא אמור להיות אפשרי';
exception when others then
  raise notice '✅  84  אי אפשר ליצור אימון של סדיר בלבד';
end $t$;

-- ════════ מקצים: הציון מחושב, ולא נכתב פעמיים ════════
reset role; reset request.jwt.claim.sub;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;

insert into drills (training_id, name, description, kind, rounds, weight)
values ((select id from trainings limit 1), 'ירי בעמידה', '20 כדורים, 5 מטרות, 50 מ׳', 'hits', 20, 1);

insert into drill_results (drill_id, person_id, shots, hits)
values ((select id from drills where name = 'ירי בעמידה'),
        (select id from people_view where name = 'דניאל כץ'), 20, 17);

select case when (select score from drill_results limit 1) = 85.00
            then '✅' else '❌' end || '  85  הציון מחושב מהפגיעות (17/20 = 85)';

do $t$ begin
  insert into drill_results (drill_id, person_id, shots, hits)
  values ((select id from drills where name = 'ירי בעמידה'),
          (select id from people_view where name = 'איתי רוזן'), 10, 12);
  raise notice '❌  86  התקבלו יותר פגיעות מכדורים';
exception when others then
  raise notice '✅  86  יותר פגיעות מכדורים נדחה';
end $t$;

-- a manual score is taken as given, and pass/fail collapses to 100 or 0
insert into drills (training_id, name, kind) values
  ((select id from trainings limit 1), 'תרגול תקלות', 'score'),
  ((select id from trainings limit 1), 'בדיקת נשק', 'passfail');

insert into drill_results (drill_id, person_id, score)
values ((select id from drills where name = 'תרגול תקלות'),
        (select id from people_view where name = 'דניאל כץ'), 72),
       ((select id from drills where name = 'בדיקת נשק'),
        (select id from people_view where name = 'דניאל כץ'), 80);

select case when (select score from drill_results r join drills d on d.id = r.drill_id
                   where d.name = 'תרגול תקלות') = 72
            then '✅' else '❌' end || '  87  ציון ידני נשמר כפי שהוזן';
select case when (select score from drill_results r join drills d on d.id = r.drill_id
                   where d.name = 'בדיקת נשק') = 100
            then '✅' else '❌' end || '  88  ״עבר/לא עבר״ נשמר כ-100';

-- a void function returns an empty string, not null, so the call is checked by
-- whether it raises rather than by what it returns
do $t$ begin
  perform set_training_grade((select id from trainings limit 1), 88, 'אימון טוב');
  raise notice '✅  89  מפקד נותן ציון לאימון';
exception when others then
  raise notice '❌  89  מתן ציון נכשל — %', sqlerrm;
end $t$;
select case when (select grade from trainings limit 1) = 88
            then '✅' else '❌' end || '  90  ציון האימון נשמר';

reset role; reset request.jwt.claim.sub;

-- a fighter may see their own result and record nothing
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;

select case when (select count(*) from drill_results) = 3
            then '✅' else '❌' end || '  91  הלוחם רואה את התוצאות שלו';

do $t$ begin
  update drill_results set hits = 20;
  if not found then raise exception 'no rows'; end if;
  raise notice '❌  92  לוחם שינה תוצאה של מקצה — כשל אבטחה';
exception when others then
  raise notice '✅  92  לוחם נחסם משינוי תוצאות';
end $t$;

do $t$ begin
  perform set_training_grade((select id from trainings limit 1), 100, '');
  raise notice '❌  93  לוחם נתן ציון לאימון — כשל אבטחה';
exception when others then
  raise notice '✅  93  לוחם נחסם ממתן ציון לאימון';
end $t$;

reset role; reset request.jwt.claim.sub;

-- ════════ רס״פ וסמל צוות: תפקידים שנושאים הרשאה ════════
--
-- שני התפקידים האלה מקבלים הרשאה מהתפקיד עצמו ולא מסימון הרשאות. הבדיקות
-- כאן הן על מה שמותר להם — וחשוב מזה, על מה שלא: הרשאה שנפתחה יותר מדי
-- נראית בדיוק כמו הרשאה שעובדת, עד היום שבו מישהו משנה מה שאסור לו.
reset role; reset request.jwt.claim.sub;
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b');

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into people (team_id, rank, name, role, pn, phone, rating) values
  ('b','רס״ל','משה רסף','רס״פ','7000010','052-6000000',7),
  ('a','סמל','יוסי סמל','סמל צוות','7000011','052-6000001',7);
reset role; reset request.jwt.claim.sub;

update people set auth_id='aaaaaaaa-0000-0000-0000-00000000000a' where pn='7000010';
update people set auth_id='bbbbbbbb-0000-0000-0000-00000000000b' where pn='7000011';

-- ── הרס״פ: ציוד ורכבים ──
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000000a';
set role authenticated;

do $t$ begin
  insert into fleet (type, tz, seats) values ('RZR', '9900123', 4);
  raise notice '✅  94  רס״פ מוסיף רכב למאגר';
exception when others then
  raise notice '❌  94  רס״פ נחסם מהוספת רכב — %', sqlerrm;
end $t$;

do $t$ begin
  insert into vehicle_types (name) values ('רכב בדיקה של הרס״פ');
  raise notice '✅  95  רס״פ מעדכן את קטלוג סוגי הרכב';
exception when others then
  raise notice '❌  95  רס״פ נחסם מעדכון הקטלוג — %', sqlerrm;
end $t$;

do $t$ begin
  insert into gear_items (training_id, name, qty, sort)
  values ((select id from trainings limit 1), 'אלונקה', 2, 99);
  raise notice '✅  96  רס״פ מעדכן ציוד של אימון';
exception when others then
  raise notice '❌  96  רס״פ נחסם מעדכון ציוד — %', sqlerrm;
end $t$;

do $t$ begin
  insert into ammo (training_id, weapon, per_fighter, allocated, sort)
  values ((select id from trainings limit 1), 'M4 / תבור', 60, 600, 99);
  raise notice '✅  97  רס״פ מעדכן תחמושת של אימון';
exception when others then
  raise notice '❌  97  רס״פ נחסם מעדכון תחמושת — %', sqlerrm;
end $t$;

-- ומה שאינו שלו
do $t$ begin
  insert into day_blocks (training_id, time, title, sort)
  values ((select id from trainings limit 1), '09:00', 'תרגיל של הרס״פ', 99);
  raise notice '❌  98  רס״פ שינה את מהלך היום — כשל אבטחה';
exception when others then
  raise notice '✅  98  רס״פ נחסם משינוי מהלך היום';
end $t$;

-- Two ways a write can be refused: the policy hides the row, so nothing is
-- updated, or the trigger raises. Both are correct refusals, and a test that
-- accepts only one of them is testing the mechanism instead of the rule — so
-- this checks the only thing that matters, that the value did not change.
do $t$
declare before_w text; after_w text;
begin
  select weapon into before_w from people_view where name = 'דניאל כץ';
  begin
    update people set weapon = 'נגב'
    where id = (select id from people_view where name = 'דניאל כץ');
  exception when others then null;
  end;
  select weapon into after_w from people_view where name = 'דניאל כץ';
  if after_w is distinct from before_w then
    raise notice '❌  99  רס״פ ערך נשק של לוחם — כשל אבטחה';
  else
    raise notice '✅  99  רס״פ נחסם מעריכת פרטי לוחם';
  end if;
end $t$;

-- ── סמל הצוות: נשק, מספר נשק והכשרות ──
reset role; reset request.jwt.claim.sub;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-00000000000b';
set role authenticated;

do $t$ begin
  update people set weapon = 'נגב', weapon_serial = '5512345'
  where id = (select id from people_view where name = 'דניאל כץ');
  if not found then raise exception 'no rows'; end if;
  raise notice '✅  100  סמל צוות מעדכן נשק ומספר נשק';
exception when others then
  raise notice '❌  100  סמל צוות נחסם מעדכון נשק — %', sqlerrm;
end $t$;

do $t$ begin
  update people set certs = jsonb_build_object('rifle', '2027-01-01')
  where id = (select id from people_view where name = 'דניאל כץ');
  if not found then raise exception 'no rows'; end if;
  raise notice '✅  101  סמל צוות מעדכן הכשרות';
exception when others then
  raise notice '❌  101  סמל צוות נחסם מעדכון הכשרות — %', sqlerrm;
end $t$;

select case when (select weapon_serial from people_view where name = 'דניאל כץ') = '5512345'
            then '✅' else '❌' end || '  102  ורואה את מספר הנשק שרשם';

do $t$ begin
  update people set name = 'שם אחר'
  where id = (select id from people_view where name = 'דניאל כץ');
  if not found then raise exception 'no rows'; end if;
  raise notice '❌  103  סמל צוות שינה שם של לוחם — כשל אבטחה';
exception when others then
  if sqlerrm = 'no rows' then raise notice '❌   103  סמל צוות נחסם משינוי שאר הפרטים — לא עודכנה אף שורה, הבדיקה לא בדקה כלום';
  else raise notice '✅  103  סמל צוות נחסם משינוי שאר הפרטים'; end if;
end $t$;

do $t$ begin
  update people set is_admin = true where id = me_id();
  if not found then raise exception 'no rows'; end if;
  raise notice '❌  104  סמל צוות מינה את עצמו למנהל — כשל אבטחה';
exception when others then
  if sqlerrm = 'no rows' then raise notice '❌   104  סמל צוות נחסם ממינוי עצמי — לא עודכנה אף שורה, הבדיקה לא בדקה כלום';
  else raise notice '✅  104  סמל צוות נחסם ממינוי עצמי'; end if;
end $t$;

do $t$ begin
  insert into fleet (type, tz, seats) values ('האמר', '9900999', 5);
  raise notice '❌  105  סמל צוות ערך את מאגר הרכבים — כשל אבטחה';
exception when others then
  raise notice '✅  105  סמל צוות נחסם ממאגר הרכבים';
end $t$;

-- ── ולוחם רגיל עדיין לא ──
reset role; reset request.jwt.claim.sub;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;

do $t$
declare before_w text; after_w text;
begin
  select weapon into before_w from people_view where name = 'איתי רוזן';
  begin
    update people set weapon = 'אקדח'
    where id = (select id from people_view where name = 'איתי רוזן');
  exception when others then null;
  end;
  select weapon into after_w from people_view where name = 'איתי רוזן';
  if after_w is distinct from before_w then
    raise notice '❌  106  לוחם רגיל ערך נשק של אחר — כשל אבטחה';
  else
    raise notice '✅  106  לוחם רגיל נחסם מעריכת נשק של אחר';
  end if;
end $t$;

reset role; reset request.jwt.claim.sub;
