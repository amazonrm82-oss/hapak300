import { FIRE_MODE_LABEL, STATUS_LABEL } from './constants';
import { dateLine, fmtFull } from './dates';
import {
  fullName,
  participants,
  personById,
  teamName,
  topicName,
  trainingTitle,
} from './selectors';
import { resultScore, scoresFor, trainingScore } from './drills';
import { ammoUsage } from './ammo';
import type { Db, Person, TrainingFull } from './types';

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

/**
 * Wraps an export body in a printable RTL document and opens the print dialog.
 *
 * The document carries its own way back. On a phone — and above all in the
 * installed app, which has no address bar and no back button — the print view
 * filled the screen with no way out of it. The way back is a plain link rather
 * than a button that closes the window, because this document inherits the
 * app's Content-Security-Policy and would have its inline script blocked.
 */
export function printHTML(title: string, bodyHTML: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const home = esc(window.location.href);
  w.document.write(
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}` +
      `h2{font-size:15px;color:#555;margin:0 0 16px;font-weight:400}table{border-collapse:collapse;width:100%;font-size:13px}` +
      `th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f2f2f2}` +
      `.muted{color:#666;font-size:12px;margin-top:18px}` +
      `.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;margin:-24px -24px 18px;padding:12px 16px;` +
      `display:flex;align-items:center;gap:12px;font-size:14px}` +
      `.bar a{color:#0a58ca;text-decoration:none;font-weight:600}` +
      `@media print{.bar{display:none}body{padding:0}}</style></head><body>` +
      `<div class="bar"><a href="${home}">חזרה למערכת</a>` +
      `<span style="color:#666;font-size:12.5px">להדפסה חוזרת — תפריט השיתוף של הדפדפן</span></div>` +
      `${bodyHTML}` +
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

/**
 * The whole unit, as one JSON file the administrator can keep.
 *
 * A hosted database is not a backup: a wrong delete, an expired project or a
 * lost account takes everything with it. This is what the unit actually owns —
 * every training, every attendance mark, every fighter, readable without this
 * app ever running again.
 */
export function backupJSON(db: Db): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format: 'hapak300-backup-1',
      settings: db.settings,
      teams: db.teams,
      topics: db.topics,
      people: db.people,
      trainings: db.trainings,
      fleet: db.fleet,
      periods: db.periods,
      calendar: db.calendar,
      catalogs: {
        gear: db.gear_catalog,
        vehicle_types: db.vehicle_types,
        weapons: db.weapons,
        locations: db.locations,
      },
    },
    null,
    2,
  );
}

/**
 * The period report the brigade asks for: who was assigned to what, who turned
 * up, the commander's rating, and which certifications lapsed.
 *
 * Computed from the trainings inside the period rather than from a running
 * total, so it says the same thing next month as it does today.
 */
export function periodReportHTML(db: Db, fromISO: string, toISO: string, title: string): string {
  const inPeriod = db.trainings.filter(
    (t) => t.status !== 'cancelled' && t.date >= fromISO && t.date <= toISO,
  );

  const roster = db.people.filter((p) => p.status === 'active' && p.team_id);
  const body = roster
    .map((p) => {
      const mine = inPeriod.filter((t) => t.team_id === 'joint' || t.team_id === p.team_id);
      const came = mine.filter((t) => {
        const a = t.attendance[p.id];
        return a && (a.status === 'coming' || a.status === 'late');
      }).length;
      const pct = mine.length ? Math.round((came / mine.length) * 100) : 0;
      const expired = Object.values(p.certs).filter((d) => d && d < toISO).length;
      return [
        fullName(p),
        p.role,
        teamName(db, p.team_id),
        `${came}/${mine.length}`,
        `${pct}%`,
        `${p.rating}/10`,
        expired ? `${expired} פקעו` : '—',
      ];
    })
    .sort((a, b) => a[2].localeCompare(b[2], 'he') || a[0].localeCompare(b[0], 'he'));

  const held = inPeriod.length;
  const joint = inPeriod.filter((t) => t.team_id === 'joint').length;

  return (
    `<h1>דו״ח כשירות תקופתי · ${esc(db.settings.unit_name)}</h1>` +
    `<h2>${esc(title)} · ${esc(fmtFull(fromISO))} — ${esc(fmtFull(toISO))}</h2>` +
    `<p class="muted">${held} אימונים בתקופה, מתוכם ${joint} משותפים · ${roster.length} לוחמים</p>` +
    `<table><thead><tr><th>לוחם</th><th>תפקיד</th><th>צוות</th><th>נוכחות</th><th>אחוז</th>` +
    `<th>דירוג מפקד</th><th>הסמכות</th></tr></thead><tbody>${rows(body)}</tbody></table>` +
    `<h2 style="margin-top:18px">האימונים שהתקיימו</h2>` +
    `<table><thead><tr><th>תאריך</th><th>נושא</th><th>צוות</th><th>מיקום</th><th>מדריך</th></tr></thead><tbody>` +
    rows(
      inPeriod
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => [
          fmtFull(t.date),
          topicName(db, t.topic_id),
          t.team_id === 'joint' ? 'משותף' : teamName(db, t.team_id),
          t.location,
          fullName(personById(db, t.instructor_id)),
        ]),
    ) +
    `</tbody></table>`
  );
}

/**
 * The drill results of one training, for printing or filing.
 *
 * A station's own numbers next to what they added up to — the record a range
 * officer would otherwise write out by hand.
 */
export function drillsHTML(db: Db, t: TrainingFull): string {
  if (!t.drills.length) return '';

  const total = trainingScore(db, t);
  const rows_ = scoresFor(db, t);

  const perDrill = t.drills
    .map((d) => {
      const body = rows(
        rows_
          .map((r) => {
            const res = d.results[r.person.id];
            const score = resultScore(d, res);
            return [
              fullName(r.person),
              d.kind === 'hits' ? (res?.shots ?? '—') : '',
              d.kind === 'hits' ? (res?.hits ?? '—') : '',
              score === null ? '—' : score.toFixed(1),
              res?.note ?? '',
            ];
          })
          .filter((row) => row[3] !== '—' || row[4]),
      );
      return (
        `<h2 style="margin-top:16px">${esc(d.name)}</h2>` +
        (d.description ? `<p class="muted">${esc(d.description)}</p>` : '') +
        `<table><thead><tr><th>לוחם</th><th>כדורים</th><th>פגיעות</th><th>ציון</th><th>הערה</th></tr></thead>` +
        `<tbody>${body}</tbody></table>`
      );
    })
    .join('');

  return (
    `<h1>מקצים וציונים · ${esc(trainingTitle(db, t))}</h1>` +
    `<h2>${esc(topicName(db, t.topic_id))} · ${esc(dateLine(t))}</h2>` +
    `<p class="muted">ממוצע הצוות: ${total.team === null ? '—' : total.team.toFixed(1)} · ` +
    `${total.scored} מתוך ${total.participants} לוחמים נמדדו` +
    (total.shots ? ` · ירי ${total.hits}/${total.shots}` : '') +
    (t.grade !== null ? ` · ציון המפקד לאימון: ${t.grade}` : '') +
    `</p>` +
    `<table><thead><tr><th>לוחם</th><th>תפקיד</th><th>מקצים</th><th>ציון מקצים</th><th>ציון מפקד</th></tr></thead><tbody>` +
    rows(
      rows_.map((r) => [
        fullName(r.person),
        r.person.role,
        `${r.done}/${r.total}`,
        r.score === null ? '—' : r.score.toFixed(1),
        t.attendance[r.person.id]?.rating ?? '—',
      ]),
    ) +
    `</tbody></table>` +
    perDrill
  );
}

// ── ammunition actually fired ──────────────────────────────────────────────

/**
 * The consumption report, in the two shapes the unit sends it.
 *
 * The numbers come from the stations rather than from a count at the gate:
 * every round a fighter fired was written down at the time, because the score
 * depends on it. What is left is to total it, put it against what the training
 * drew, and say the difference out loud.
 */
export function ammoText(db: Db, t: TrainingFull): string {
  const u = ammoUsage(db, t);
  const lines = [
    `דו״ח צריכת תחמושת — ${db.settings.unit_name}`,
    `${trainingTitle(db, t)} · ${topicName(db, t.topic_id)}`,
    dateLine(t),
    `מיקום: ${t.location} · אימון ${FIRE_MODE_LABEL[t.fire_mode]}`,
    '',
  ];

  if (t.fire_mode === 'dry') {
    lines.push('אימון יבש — לא הוקצתה ולא נצרכה תחמושת.');
    return lines.join('\n');
  }
  if (u.empty) {
    lines.push('לא נרשם ירי במקצים של האימון הזה.');
    return lines.join('\n');
  }

  lines.push('לפי סוג נשק:');
  for (const r of u.rows) {
    if (!r.fired && !r.allocated) continue;
    const parts = [`  ${r.weapon}: נורו ${r.fired} כד׳`];
    if (r.fighters) parts.push(`${r.fighters} לוחמים`);
    if (r.allocated) parts.push(`הוקצו ${r.allocated} · יתרה ${r.allocated - r.fired}`);
    lines.push(parts.join(' · '));
  }

  lines.push('', 'לפי מקצה:');
  for (const d of u.byDrill) {
    lines.push(`  ${d.name}: ${d.fired} כד׳ · ${d.hits} פגיעות`);
  }

  lines.push(
    '',
    `סה״כ נורו: ${u.fired} כד׳ · ${u.hits} פגיעות` +
      (u.fired ? ` (${Math.round((100 * u.hits) / u.fired)}%)` : ''),
  );
  if (u.allocated) lines.push(`סה״כ הוקצו: ${u.allocated} כד׳ · יתרה ${u.allocated - u.fired}`);
  if (u.recorded) lines.push(`נרשם ידנית בלוגיסטיקה: ${u.recorded} כד׳`);
  if (u.unassigned)
    lines.push(`מתוכם ${u.unassigned} כד׳ של לוחמים שלא רשום להם נשק אישי בכרטיס`);

  return lines.join('\n');
}

/** The same report as printable HTML — the body of the PDF export. */
export function ammoHTML(db: Db, t: TrainingFull): string {
  const u = ammoUsage(db, t);
  const head =
    `<h1>דו״ח צריכת תחמושת · ${esc(trainingTitle(db, t))} · ${esc(topicName(db, t.topic_id))}</h1>` +
    `<h2>${esc(dateLine(t))} · ${esc(t.location)} · אימון ${esc(FIRE_MODE_LABEL[t.fire_mode])}</h2>`;

  if (t.fire_mode === 'dry')
    return `${head}<p>אימון יבש — לא הוקצתה ולא נצרכה תחמושת.</p>`;
  if (u.empty)
    return `${head}<p>לא נרשם ירי במקצים של האימון הזה.</p>`;

  const weapons = u.rows
    .filter((r) => r.fired || r.allocated)
    .map(
      (r) =>
        `<tr><td>${esc(r.weapon)}</td><td>${r.fighters || ''}</td><td>${r.fired}</td><td>${r.hits}</td>` +
        `<td>${r.fired ? `${Math.round((100 * r.hits) / r.fired)}%` : ''}</td>` +
        `<td>${r.allocated || ''}</td><td>${r.allocated ? r.allocated - r.fired : ''}</td>` +
        `<td>${r.recorded || ''}</td></tr>`,
    )
    .join('');

  const drills = u.byDrill
    .map((d) => `<tr><td>${esc(d.name)}</td><td>${d.fighters}</td><td>${d.fired}</td><td>${d.hits}</td></tr>`)
    .join('');

  const total =
    `<tr><th>סה״כ</th><th></th><th>${u.fired}</th><th>${u.hits}</th>` +
    `<th>${u.fired ? `${Math.round((100 * u.hits) / u.fired)}%` : ''}</th>` +
    `<th>${u.allocated || ''}</th><th>${u.allocated ? u.allocated - u.fired : ''}</th>` +
    `<th>${u.recorded || ''}</th></tr>`;

  return (
    head +
    `<table><thead><tr><th>נשק</th><th>לוחמים</th><th>נורו</th><th>פגיעות</th><th>אחוז</th>` +
    `<th>הוקצו</th><th>יתרה</th><th>נרשם ידנית</th></tr></thead>` +
    `<tbody>${weapons}${total}</tbody></table>` +
    `<h2 style="margin-top:18px">פירוט לפי מקצה</h2>` +
    `<table><thead><tr><th>מקצה</th><th>לוחמים</th><th>נורו</th><th>פגיעות</th></tr></thead><tbody>${drills}</tbody></table>` +
    (u.unassigned
      ? `<p class="muted">${u.unassigned} כדורים נורו על ידי לוחמים שלא רשום להם נשק אישי בכרטיס — הם מופיעים בשורה ״ללא נשק רשום״.</p>`
      : '') +
    `<p class="muted">הכמויות מחושבות מהמקצים של האימון: כל כדור שנרשם ללוחם במקצה נספר לנשק האישי שלו.</p>`
  );
}

// ── צל״ם: the kit each fighter signs for ───────────────────────────────────

/**
 * Who holds what, by serial.
 *
 * A צל״ם list used to be assembled by walking the team and asking. Every number
 * on it is already on the cards — the weapon, its serial, the night vision and
 * its serial — so the list is a matter of printing what is known, and the gaps
 * are the point: a blank serial is a fighter nobody has signed for yet.
 */
export function kitText(db: Db, people: Person[], scope: string): string {
  const lines = [`דו״ח צל״ם — ${db.settings.unit_name}`, scope, '', ...people.map((p) => {
    const parts = [
      `${fullName(p)}${p.role ? ` · ${p.role}` : ''}`,
      `  נשק: ${p.weapon || '—'} · צ׳ ${p.weapon_serial || '—'}`,
      `  אמר״ל: ${p.nvg || '—'} · צ׳ ${p.nvg_serial || '—'}`,
    ];
    return parts.join('\n');
  })];

  const missing = people.filter(
    (p) => !p.weapon || !p.weapon_serial || !p.nvg || !p.nvg_serial,
  ).length;
  lines.push('', `${people.length} לוחמים`);
  if (missing) lines.push(`${missing} מהם חסרים פרט אחד או יותר`);
  return lines.join('\n');
}

/** The same list as printable HTML — the body of the PDF export. */
export function kitHTML(db: Db, people: Person[], scope: string): string {
  const body = people
    .map((p) => {
      const gap = (v: string) =>
        v ? esc(v) : '<span style="color:#b00">חסר</span>';
      return (
        `<tr><td>${esc(fullName(p))}</td><td>${esc(teamName(db, p.team_id))}</td><td>${esc(p.role)}</td>` +
        `<td>${gap(p.weapon)}</td><td>${gap(p.weapon_serial)}</td>` +
        `<td>${gap(p.nvg)}</td><td>${gap(p.nvg_serial)}</td></tr>`
      );
    })
    .join('');
  const missing = people.filter((p) => !p.weapon || !p.weapon_serial || !p.nvg || !p.nvg_serial).length;
  return (
    `<h1>דו״ח צל״ם · ${esc(db.settings.unit_name)}</h1>` +
    `<h2>${esc(scope)} · ${people.length} לוחמים</h2>` +
    `<table><thead><tr><th>שם ודרגה</th><th>צוות</th><th>תפקיד</th>` +
    `<th>סוג נשק</th><th>מספר נשק</th><th>סוג אמר״ל</th><th>מספר אמר״ל</th></tr></thead>` +
    `<tbody>${body}</tbody></table>` +
    (missing
      ? `<p class="muted">${missing} לוחמים חסרים פרט אחד או יותר — הם מסומנים ״חסר״ בטבלה.</p>`
      : '<p class="muted">כל הפרטים מלאים.</p>')
  );
}
