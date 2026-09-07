import { supabase } from '@/lib/supabase/client';
import type {
  Attendance,
  Db,
  Person,
  Settings,
  Team,
  TeamKey,
  TrainingFull,
} from '@/lib/core/types';

/**
 * The whole unit's state in one snapshot. At this scale — two teams, a few
 * dozen people, a season of trainings — a handful of selects is cheaper and far
 * simpler than per-screen queries, and it lets the ported rules run unchanged
 * against exactly the object shape they were written for.
 */
export async function loadDb(): Promise<Db> {
  const sb = supabase();

  const [
    settings,
    teams,
    topics,
    people,
    trainings,
    dayBlocks,
    attendance,
    gear,
    vehicles,
    ammo,
    food,
    chat,
    feedback,
    photos,
    calendar,
    notifications,
    reads,
    joinRequests,
    gearCatalog,
    vehicleTypes,
    weapons,
    locations,
    fleet,
    periods,
  ] = await Promise.all([
    sb.from('settings').select('*').single(),
    sb.from('teams').select('*'),
    sb.from('topics').select('*').order('sort'),
    sb.from('people_view').select('*'),
    sb.from('trainings_view').select('*').order('date'),
    sb.from('day_blocks').select('*').order('sort'),
    sb.from('attendance').select('*'),
    sb.from('gear_items').select('*').order('sort'),
    sb.from('vehicles').select('*').order('sort'),
    sb.from('ammo').select('*').order('sort'),
    sb.from('food').select('*').order('sort'),
    sb.from('chat_messages').select('*').order('time'),
    sb.from('feedback').select('*'),
    sb.from('photos').select('*').order('created_at'),
    sb.from('calendar_events').select('*').order('date'),
    sb.from('notifications').select('*').order('time', { ascending: false }).limit(80),
    sb.from('notification_reads').select('notification_id'),
    sb.from('join_requests').select('*').eq('status', 'pending'),
    sb.from('gear_catalog').select('name').order('sort'),
    sb.from('vehicle_types').select('name').order('sort'),
    sb.from('weapons').select('name').order('sort'),
    sb.from('locations').select('name').order('sort'),
    sb.from('fleet').select('*').order('sort'),
    sb.from('periods').select('*').order('closed_at', { ascending: false }),
  ]);

  const firstError = [settings, teams, topics, people, trainings].find((r) => r.error)?.error;
  if (firstError) throw new Error(`טעינת הנתונים נכשלה: ${firstError.message}`);

  const byTraining = <T extends { training_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    (rows ?? []).forEach((r) => {
      const list = map.get(r.training_id);
      if (list) list.push(r);
      else map.set(r.training_id, [r]);
    });
    return map;
  };

  const blocksBy = byTraining(dayBlocks.data as never[]);
  const attBy = byTraining(attendance.data as never[]);
  const gearBy = byTraining(gear.data as never[]);
  const vehBy = byTraining(vehicles.data as never[]);
  const ammoBy = byTraining(ammo.data as never[]);
  const foodBy = byTraining(food.data as never[]);
  const chatBy = byTraining(chat.data as never[]);
  const fbBy = byTraining(feedback.data as never[]);
  const photoBy = byTraining(photos.data as never[]);

  const readSet = new Set((reads.data ?? []).map((r: { notification_id: string }) => r.notification_id));

  const fullTrainings: TrainingFull[] = (trainings.data ?? []).map((t: Record<string, unknown>) => {
    const id = t.id as string;
    const attMap: Record<string, Attendance> = {};
    (attBy.get(id) ?? []).forEach((a: Record<string, unknown>) => {
      attMap[a.person_id as string] = {
        status: a.status as Attendance['status'],
        reason: (a.reason as string) ?? '',
        marked_at: stamp(a.marked_at as string),
        approved: !!a.approved,
        approved_by: (a.approved_by as string) ?? null,
        rating: (a.rating as number) ?? null,
        auto: !!a.auto,
      };
    });

    const fbMap: Record<string, TrainingFull['feedback'][string]> = {};
    (fbBy.get(id) ?? []).forEach((f: Record<string, unknown>) => {
      fbMap[f.person_id as string] = {
        overall: f.overall as number,
        instructor: (f.instructor as number) ?? 0,
        logistics: (f.logistics as number) ?? 0,
        comment: (f.comment as string) ?? '',
        time: stamp(f.time as string),
      };
    });

    return {
      id,
      seq: (t.seq as number) ?? 0,
      team_id: t.team_id as TrainingFull['team_id'],
      topic_id: t.topic_id as string,
      date: t.date as string,
      end_date: (t.end_date as string) ?? null,
      start: t.start_time as string,
      end: t.end_time as string,
      location: (t.location as string) ?? '',
      coords: (t.coords as string) ?? '',
      instructor_id: (t.instructor_id as string) ?? null,
      commander_id: (t.commander_id as string) ?? null,
      inst_status: t.inst_status as TrainingFull['inst_status'],
      cmd_status: t.cmd_status as TrainingFull['cmd_status'],
      inst_invited_at: t.inst_invited_at ? stamp(t.inst_invited_at as string) : null,
      cmd_invited_at: t.cmd_invited_at ? stamp(t.cmd_invited_at as string) : null,
      status: t.status as TrainingFull['status'],
      freq: (t.freq as string) ?? '',
      safety: (t.safety as string) ?? '',
      pickup: (t.pickup as string) ?? '',
      departure: (t.departure as string) ?? '',
      medic_id: (t.medic_id as string) ?? null,
      evac_vehicle_id: (t.evac_vehicle_id as string) ?? null,
      order_file: (t.order_file as TrainingFull['order_file']) ?? null,
      notes: (t.notes as string) ?? '',
      trainer_summarized: !!t.trainer_summarized,
      approved_all: !!t.approved_all,
      ammo_signed: !!t.ammo_signed,
      ammo_signed_by: (t.ammo_signed_by as string) ?? null,
      ammo_signed_at: t.ammo_signed_at ? stamp(t.ammo_signed_at as string) : null,
      cancel_reason: (t.cancel_reason as string) ?? '',
      summary: (t.summary as TrainingFull['summary']) ?? {
        commander: '',
        instructor: '',
        keep: '',
        improve: '',
      },
      approval_log: (t.approval_log as TrainingFull['approval_log']) ?? [],
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
      day_blocks: (blocksBy.get(id) ?? []) as TrainingFull['day_blocks'],
      attendance: attMap,
      gear: (gearBy.get(id) ?? []) as TrainingFull['gear'],
      vehicles: (vehBy.get(id) ?? []) as TrainingFull['vehicles'],
      ammo: (ammoBy.get(id) ?? []) as TrainingFull['ammo'],
      food: (foodBy.get(id) ?? []) as TrainingFull['food'],
      chat: (chatBy.get(id) ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        author_id: m.author_id as string,
        text: (m.text as string) ?? '',
        time: stamp(m.time as string),
        pinned: !!m.pinned,
        read_by: (m.read_by as string[]) ?? [],
        attachment: (m.attachment as TrainingFull['chat'][number]['attachment']) ?? null,
      })),
      feedback: fbMap,
      photos: (photoBy.get(id) ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        url: (p.path as string) ?? null,
        by: (p.by_id as string) ?? '',
      })),
    };
  });

  const teamRows = (teams.data ?? []) as Team[];
  // סדיר ('c') joins every training rather than holding its own; a database
  // that predates it simply has no row, and the fallback keeps the app working
  const team = (id: TeamKey, name: string, attendsAll = false): Team =>
    teamRows.find((t) => t.id === id) ?? { id, name, attends_all: attendsAll, commander_id: null };

  return {
    settings: settings.data as Settings,
    teams: {
      a: team('a', 'צוות א׳'),
      b: team('b', 'צוות ב׳'),
      c: team('c', 'סדיר', true),
    },
    topics: (topics.data ?? []) as Db['topics'],
    people: ((people.data ?? []) as Record<string, unknown>[]).map(
      (p) =>
        ({
          ...p,
          pn: (p.pn as string) ?? '',
          qual: (p.qual as string[]) ?? [],
          certs: (p.certs as Person['certs']) ?? {},
          notif: (p.notif as Person['notif']) ?? {
            evening: true,
            morning: true,
            approved: true,
            changed: true,
          },
        }) as Person,
    ),
    trainings: fullTrainings,
    gear_catalog: (gearCatalog.data ?? []).map((r: { name: string }) => r.name),
    vehicle_types: (vehicleTypes.data ?? []).map((r: { name: string }) => r.name),
    weapons: (weapons.data ?? []).map((r: { name: string }) => r.name),
    locations: (locations.data ?? []).map((r: { name: string }) => r.name),
    fleet: (fleet.data ?? []) as Db['fleet'],
    periods: (periods.data ?? []) as Db['periods'],
    calendar: (calendar.data ?? []) as Db['calendar'],
    notifications: ((notifications.data ?? []) as Record<string, unknown>[]).map((n) => ({
      id: n.id as string,
      text: n.text as string,
      time: stamp(n.time as string),
      to: (n.to as string[]) ?? null,
      training_id: (n.training_id as string) ?? null,
      read: readSet.has(n.id as string),
    })),
    join_requests: (joinRequests.data ?? []) as Db['join_requests'],
  };
}

/** `2026-09-23T07:14:00Z` → `2026-09-23 10:14` in Israel time, as the UI shows it. */
function stamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}
