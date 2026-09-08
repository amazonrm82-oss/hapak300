-- ═══════════════════════════════════════════════════════════════════════════
-- Clean starting state: the unit's settings, both teams, the ten topics with
-- their safety templates, the catalogs — and exactly two people, the system
-- administrator and the HQ-party commander. No trainings, no demo data:
-- the roster and the rotation are entered in the app.
-- ═══════════════════════════════════════════════════════════════════════════

insert into settings (id, app_name, unit_name, brigade_commander, period_start, period_name,
                      real_mode, allow_join, min_attendance, essential_roles, invite_hours,
                      evening_reminder, morning_reminder_before, approval_window_hours,
                      cert_alert_days, summary_lock_days)
values (true, 'כשירות חפ״ק מח״ט 300', 'חפ״ק מח״ט 300', '', '2026-09-20', 'חורף 2026',
        true, true, 6, array['חובש'], 48, '18:00', 120, 48, 30, 7)
on conflict (id) do nothing;

-- סדיר has no trainings of its own: its members are rostered to every training
-- that צוות א׳ or צוות ב׳ hold, which is what `attends_all` means.
insert into teams (id, name, attends_all) values
  ('a', 'צוות א׳', false),
  ('b', 'צוות ב׳', false),
  ('c', 'סדיר',    true)
on conflict (id) do nothing;

insert into topics (id, name, safety, sort) values
  ('setup', 'הקמת חפ״ק ופריסה',
   'עבודה בזוגות בהקמת האוהל · חיבור גנרטור רק על ידי בעל הסמכה · הארקה לפני הפעלת מסכים · מים בהישג יד בכל עמדה.', 1),
  ('comms', 'קשר ושו״ב',
   'אין שידור ללא אישור קצין הקשר · שמירת משמעת רשת · חובה קסדה בעבודה על תרנים · ניתוק מצברים בסיום.', 2),
  ('nav', 'ניווט וקריאת מפה',
   'ניווט בזוגות בלבד · דיווח נצ״ד כל 30 דקות · 3 ליטר מים ללוחם · חובש עם רכב פינוי בציר המרכזי.', 3),
  ('fire', 'ירי והכשרת נשק',
   'מנהלת מטווח: רס״ר גיא ניסים · נשק פרוק וטעון רק בעמדה · קו ירי אחד · ״הפסק אש״ מכל לוחם · חובש בעמדת הפיקוד.', 4),
  ('drive', 'נהיגה מבצעית',
   'חגורות בכל נסיעה · מהירות עד 40 קמ״ש בשטח · מפקד רכב בכל רכב · תדריך מסלול לפני יציאה.', 5),
  ('medic', 'עזרה ראשונה קרבית',
   'תרגול חוסם עורקים עד 30 שניות בלבד · אין מחטים אמיתיות · ערכת חובש אמיתית נפרדת מציוד התרגול.', 6),
  ('secure', 'אבטחת חפ״ק',
   'נשק ללא מחסנית בתרגול · תיאום גזרות ירי · הבחנה בין כוח מתרגל לכוח מאבטח (סרטים).', 7),
  ('night', 'ניוד חפ״ק בלילה',
   'נסיעה עם אמר״ל בלבד באישור · מרחק 50 מ׳ בין רכבים · חובה פנס אדום · דיווח הגעה בכל נקודת עצירה.', 8),
  ('fitness', 'כשירות גופנית',
   'שתייה לפני ואחרי · הפסקת פעילות מעל 32° · חובש נוכח · אין ריצה בכביש.', 9),
  ('hq', 'תרגיל מפקדות',
   'כל הוראות אימון ניוד ואבטחה חלות · מנוחה מינימלית 4 שעות · ניהול סיכונים של מפקד התרגיל לפני כל שלב.', 10)
on conflict (id) do nothing;

insert into gear_catalog (name, sort) values
  ('אפוד וקסדה', 1), ('מכשירי קשר', 2), ('אמר״ל / משקפי לילה', 3), ('מפות ומצפנים', 4),
  ('ערכת חובש', 5), ('אוהל חפ״ק ושולחנות', 6), ('גנרטור ותאורה', 7),
  ('מחשבים / מסכי שו״ב', 8), ('ציוד סימון משטח', 9)
on conflict (name) do nothing;

insert into vehicle_types (name, sort) values
  ('האמר', 1), ('רוביקון', 2), ('RZR', 3), ('זאב', 4), ('סופה', 5),
  ('נגמ״ש', 6), ('רכב קשר', 7), ('משאית', 8), ('אופנוע', 9), ('אמבולנס', 10)
on conflict (name) do nothing;

insert into weapons (name, sort) values
  ('M4 / תבור', 1), ('נגב', 2), ('מא״ג', 3), ('אקדח', 4), ('מטול רימונים', 5),
  ('רימוני רסס', 6), ('רימוני עשן', 7), ('סימונים / נורים', 8)
on conflict (name) do nothing;

-- The two people who can log in on day one. Everyone else is added from the
-- "צוותים" screen; nobody can sign in until they appear in this table.
insert into people (rank, name, role, pn, phone, team_id, rating, is_admin, is_hapak_commander)
values
  ('רס״ן', 'מתן זזון',   'מנהל מערכת',  '8409505', '052-5621437', null, 10, true,  false),
  ('סרן',  'ישראל קדוש', 'מפקד החפ״ק', '7387250', '058-5455567', null, 10, false, true)
on conflict (pn) do nothing;

-- ── storage ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('training-photos', 'training-photos', false),
  ('training-orders', 'training-orders', false),
  ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Signed URLs only: any signed-in member of the unit may read and upload,
-- and remove what they uploaded themselves. Dropped first so this file can be
-- run again safely.
drop policy if exists "unit reads objects" on storage.objects;
drop policy if exists "unit uploads objects" on storage.objects;
drop policy if exists "owner removes objects" on storage.objects;

create policy "unit reads objects" on storage.objects for select to authenticated
  using (bucket_id in ('training-photos', 'training-orders', 'chat-attachments'));
create policy "unit uploads objects" on storage.objects for insert to authenticated
  with check (bucket_id in ('training-photos', 'training-orders', 'chat-attachments'));
create policy "owner removes objects" on storage.objects for delete to authenticated
  using (bucket_id in ('training-photos', 'training-orders', 'chat-attachments')
         and (owner = auth.uid() or is_admin()));
