import { STATUS_LABEL } from './constants';
import { dateLine, fmtFull } from './dates';
import {
  fullName,
  participants,
  personById,
  teamName,
  topicName,
  trainingTitle,
} from './selectors';
import type { Db, TrainingFull } from './types';

// Quotes are escaped too: this output is also read inside attributes, and a
// name or a location is text the unit types, not text we control.
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );

const rows = (arr: unknown[][]) =>
  arr.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');

/** Attendance export for Excel. UTF-8 BOM so Hebrew opens correctly. */
export function attendanceCSV(db: Db, t: TrainingFull): string {
  const out: string[][] = [
    ['שם ודרגה', 'מספר אישי', 'צוות', 'תפקיד', 'סטטוס נוכחות', 'סיבה', 'שעת סימון', 'מאשר'],
  ];
  participants(db, t).forEach((p) => {
    const a = t.attendance[p.id];
    out.push([
      fullName(p),
      p.pn,
      teamName(db, p.team_id),
      p.role,
      a ? STATUS_LABEL[a.status] : 'לא הגיב (נחשב לא מגיע)',
      a ? a.reason : '',
      a ? a.marked_at : '',
      a && a.approved ? fullName(personById(db, a.approved_by)) : '',
    ]);
  });
  return '﻿' + out.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Plain-text training order — what gets pasted into WhatsApp. */
export function orderText(db: Db, t: TrainingFull): string {
  const i = personById(db, t.instructor_id);
  const c = personById(db, t.commander_id);
  const lines = [
    `פקודת אימון — ${db.settings.unit_name}`,
    `${trainingTitle(db, t)} · ${topicName(db, t.topic_id)}`,
    dateLine(t),
    `מיקום: ${t.location} · נצ״ד ${t.coords}`,
    `מדריך: ${fullName(i)} · מפקד אימון: ${fullName(c)}`,
    `יציאה: ${t.departure} מ${t.pickup}`,
    `קשר: ${t.freq}`,
    `בטיחות: ${t.safety}`,
    '',
    'לו״ז יום:',
    ...t.day_blocks.map((b) => `  ${b.time} ${b.title}`),
    '',
    'לוגיסטיקה:',
    ...t.gear.map((g) => `  ${g.name} ×${g.qty}`),
    ...t.vehicles.map(
      (v) => `  ${v.type} צ׳ ${v.tz} · נהג ${fullName(personById(db, v.driver_id))} · יציאה ${v.departure}`,
    ),
    ...t.ammo.map(
      (a) => `  ${a.weapon}: ${a.allocated} כד׳${a.per_fighter ? ` (${a.per_fighter} ללוחם)` : ''}`,
    ),
    ...t.food.map((f) => `  ${f.name} ${f.qty} ${f.unit}`),
  ];
  return lines.join('\n');
}

/** Training order as printable HTML — the body of the PDF export. */
export function orderHTML(db: Db, t: TrainingFull): string {
  return (
    `<h1>פקודת אימון · ${esc(trainingTitle(db, t))} · ${esc(topicName(db, t.topic_id))}</h1>` +
    `<h2>${esc(dateLine(t))} · ${esc(t.location)} · נצ״ד ${esc(t.coords)}</h2>` +
    `<table><tbody>${rows([
      ['מדריך', fullName(personById(db, t.instructor_id))],
      ['מפקד אימון', fullName(personById(db, t.commander_id))],
      ['יציאה', `${t.departure} מ${t.pickup}`],
      ['קשר', t.freq],
      ['חובש תורן', fullName(personById(db, t.medic_id))],
      ['הוראות בטיחות', t.safety],
      ['הערות', t.notes || '—'],
    ])}</tbody></table>` +
    `<h2 style="margin-top:16px">לו״ז יום האימון</h2><table><tbody>${rows(
      t.day_blocks.map((b) => [b.time, b.title]),
    )}</tbody></table>` +
    `<h2 style="margin-top:16px">לוגיסטיקה</h2><table><thead><tr><th>ציוד</th><th>כמות</th></tr></thead><tbody>${rows(
      t.gear.map((g) => [g.name, g.qty]),
    )}</tbody></table>` +
    `<table style="margin-top:8px"><thead><tr><th>רכב</th><th>צ׳</th><th>נהג</th><th>יציאה</th><th>מקומות</th></tr></thead><tbody>${rows(
      t.vehicles.map((v) => [v.type, v.tz, fullName(personById(db, v.driver_id)), v.departure, v.seats]),
    )}</tbody></table>` +
    `<table style="margin-top:8px"><thead><tr><th>נשק</th><th>כדורים ללוחם</th><th>הקצאה</th></tr></thead><tbody>${rows(
      t.ammo.map((a) => [a.weapon, a.per_fighter || '—', a.allocated]),
    )}</tbody></table>` +
    `<table style="margin-top:8px"><thead><tr><th>מזון ושתייה</th><th>כמות</th><th>הערה</th></tr></thead><tbody>${rows(
      t.food.map((f) => [f.name, `${f.qty} ${f.unit}`, f.note]),
    )}</tbody></table>`
  );
}

/** Attendance report as printable HTML. */
export function attendanceHTML(db: Db, t: TrainingFull): string {
  const body = participants(db, t)
    .map((p) => {
      const a = t.attendance[p.id];
      return `<tr><td>${esc(fullName(p))}</td><td>${esc(p.pn)}</td><td>${esc(teamName(db, p.team_id))}</td><td>${esc(p.role)}</td><td>${esc(a ? STATUS_LABEL[a.status] : 'לא הגיב')}</td><td>${esc(a ? a.reason : '')}</td><td>${esc(a ? a.marked_at : '')}</td><td>${esc(a && a.approved ? fullName(personById(db, a.approved_by)) : '')}</td></tr>`;
    })
    .join('');
  return (
    `<h1>דוח נוכחות · ${esc(trainingTitle(db, t))} · ${esc(topicName(db, t.topic_id))}</h1>` +
    `<h2>${esc(dateLine(t))} · ${esc(t.location)}</h2>` +
    `<table><thead><tr><th>שם ודרגה</th><th>מספר אישי</th><th>צוות</th><th>תפקיד</th><th>סטטוס</th><th>סיבה</th><th>שעת סימון</th><th>מאשר</th></tr></thead><tbody>${body}</tbody></table>`
  );
}

/** Weekly schedule as printable HTML. */
export function scheduleHTML(db: Db, trainings: TrainingFull[], weekOf: (iso: string) => number): string {
  const body = trainings
    .map(
      (t) =>
        `<tr><td>${String(weekOf(t.date)).padStart(2, '0')}</td><td>${esc(trainingTitle(db, t))}</td><td>${esc(topicName(db, t.topic_id))}</td><td>${esc(dateLine(t))}</td><td>${esc(t.location)}</td><td>${esc(fullName(personById(db, t.instructor_id)))}</td><td>${esc(fullName(personById(db, t.commander_id)))}</td></tr>`,
    )
    .join('');
  return (
    `<h1>לו״ז אימונים · ${esc(db.settings.unit_name)}</h1><h2>תקופת ${esc(db.settings.period_name)} · מ-${esc(fmtFull(db.settings.period_start))}</h2>` +
    `<table><thead><tr><th>שבוע</th><th>אימון</th><th>נושא</th><th>מועד</th><th>מיקום</th><th>מדריך</th><th>מפקד אימון</th></tr></thead><tbody>${body}</tbody></table>`
  );
}

/** Wraps an export body in a printable RTL document and opens the print dialog. */
export function printHTML(title: string, bodyHTML: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}` +
      `h2{font-size:15px;color:#555;margin:0 0 16px;font-weight:400}table{border-collapse:collapse;width:100%;font-size:13px}` +
      `th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f2f2f2}` +
      `.muted{color:#666;font-size:12px;margin-top:18px}</style></head><body>${bodyHTML}` +
      `<p class="muted">הופק מ-${esc(title)} · ${new Date().toLocaleString('he-IL')}</p></body></html>`,
  );
  w.document.close();
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* the browser may block printing; the document is still open */
    }
  }, 300);
  return true;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
