/**
 * Domain types. Field names are the database's (snake_case) so rows coming back
 * from Supabase are usable as-is — there is no mapping layer to drift out of sync.
 */

/** 'c' is סדיר — a roster group that joins א׳ and ב׳ rather than training alone. */
export type TeamKey = 'a' | 'b' | 'c';
/** A training belongs to one of the two teams, or to both. סדיר never has its own. */
export type TrainingTeam = 'a' | 'b' | 'joint';
export type PersonStatus = 'active' | 'inactive';
export type TrainingStatus = 'planned' | 'published' | 'done' | 'cancelled';
export type InviteStatus = 'pending' | 'accepted' | 'declined';
export type AttStatus = 'coming' | 'late' | 'absent' | 'sick' | 'reserve' | 'other';
export type Fitness = 'כשיר' | 'טעון בדיקה' | 'מושבת';
export type CertType = 'fire' | 'drive' | 'medic' | 'comms' | 'mildrive' | 'medical';
export type InviteRole = 'instructor' | 'commander';

export interface NotifPrefs {
  evening: boolean;
  morning: boolean;
  approved: boolean;
  changed: boolean;
}

export interface Settings {
  app_name: string;
  unit_name: string;
  brigade_commander: string;
  period_start: string; // ISO date, a Sunday
  period_name: string;
  real_mode: boolean;
  allow_join: boolean;
  min_attendance: number;
  essential_roles: string[];
  invite_hours: number;
  evening_reminder: string; // HH:MM
  morning_reminder_before: number; // minutes
  approval_window_hours: number;
  cert_alert_days: number;
  summary_lock_days: number;
}

export interface Team {
  id: TeamKey;
  name: string;
  /** Joins every other team's training instead of holding its own. */
  attends_all: boolean;
  commander_id: string | null;
}

export interface Topic {
  id: string;
  name: string;
  safety: string;
  sort: number;
}

export interface Person {
  id: string;
  team_id: TeamKey | null;
  rank: string;
  name: string;
  role: string;
  pn: string; // masked to '' for viewers without `seesPN`
  phone: string;
  status: PersonStatus;
  status_note: string;
  rating: number; // 1–10, periodic commander rating
  qual: string[]; // topic ids this person is certified to instruct
  is_team_commander: boolean;
  is_instructor: boolean;
  is_admin: boolean;
  is_hapak_commander: boolean;
  certs: Partial<Record<CertType, string>>; // expiry dates
  /** The weapon this fighter holds; the serial is masked from other fighters. */
  weapon: string;
  weapon_serial: string;
  /** Night vision signed for by this fighter, and its serial. */
  nvg: string;
  nvg_serial: string;
  /** Israeli medical profile, 21–97, or null when it has not been entered. */
  medical_profile: number | null;
  limitations: string;
  notif: NotifPrefs;
  has_pin: boolean; // the hash itself never leaves the server
}

export interface Attendance {
  status: AttStatus;
  reason: string;
  marked_at: string;
  approved: boolean;
  approved_by: string | null;
  rating: number | null;
  auto: boolean; // set by the final approval for anyone who never responded
}

export interface DayBlock {
  id: string;
  time: string;
  title: string;
}

export interface GearItem {
  id: string;
  name: string;
  qty: number;
  returned: boolean;
  missing: string;
  owner_id: string | null;
}

export interface Vehicle {
  id: string;
  type: string;
  tz: string;
  driver_id: string | null;
  seats: number;
  departure: string;
  fitness: Fitness;
  fault: string;
}

/** A vehicle the unit owns, entered once and picked by its צ׳ from then on. */
export interface FleetVehicle {
  id: string;
  tz: string;
  type: string;
  seats: number;
  fitness: Fitness;
  note: string;
  active: boolean;
}

export interface AmmoRow {
  id: string;
  weapon: string;
  per_fighter: number;
  allocated: number;
  used: number;
}

export interface FoodRow {
  id: string;
  name: string;
  qty: number;
  unit: string;
  note: string;
}

export interface Attachment {
  name: string;
  is_image: boolean;
  url: string | null;
  size: number;
}

export interface ChatMessage {
  id: string;
  author_id: string;
  text: string;
  time: string;
  pinned: boolean;
  read_by: string[];
  attachment: Attachment | null;
}

export interface Feedback {
  overall: number;
  instructor: number;
  logistics: number;
  comment: string;
  time: string;
}

export interface Photo {
  id: string;
  name: string;
  url: string | null;
  by: string;
}

/** A station inside a training: ירי בעמידה, ירי בתנועה, החלפת מחסנית. */
export interface Drill {
  id: string;
  name: string;
  description: string;
  kind: 'hits' | 'score' | 'passfail';
  /** Rounds a fighter is expected to fire, for prefilling and the ammo plan. */
  rounds: number;
  /** How much this station counts in the training's average. */
  weight: number;
  sort: number;
  /** Results by person id. */
  results: Record<string, DrillResult>;
}

export interface DrillResult {
  id: string;
  person_id: string;
  shots: number | null;
  hits: number | null;
  /** 0–100. Written by the database for a hits drill, entered for the others. */
  score: number | null;
  note: string;
  by_id: string | null;
  at: string;
}

export interface TrainingSummary {
  commander: string;
  instructor: string;
  keep: string;
  improve: string;
}

export interface ApprovalEntry {
  by: string;
  at: string;
  scope: string; // person id, or 'all'
}

export interface Training {
  id: string;
  seq: number;
  team_id: TrainingTeam;
  topic_id: string;
  date: string;
  end_date: string | null;
  start: string;
  end: string;
  location: string;
  coords: string;
  instructor_id: string | null;
  commander_id: string | null;
  inst_status: InviteStatus;
  cmd_status: InviteStatus;
  inst_invited_at: string | null;
  cmd_invited_at: string | null;
  status: TrainingStatus;
  freq: string;
  safety: string;
  pickup: string;
  departure: string;
  medic_id: string | null;
  evac_vehicle_id: string | null;
  order_file: { name: string; size: number } | null;
  notes: string;
  trainer_summarized: boolean;
  approved_all: boolean;
  ammo_signed: boolean;
  ammo_signed_by: string | null;
  ammo_signed_at: string | null;
  cancel_reason: string;
  /** The commander's grade for the training as a whole, 0–100. */
  grade: number | null;
  grade_note: string;
  summary: TrainingSummary;
  created_at: string;
  updated_at: string;
}

/** A training with everything hanging off it — what the screens and rules operate on. */
/**
 * A fighter attached to a training that is not his team's — either making up
 * one he missed, or lent to another force for the day.
 */
export interface TrainingGuest {
  person_id: string;
  /** The training this stands in for, when it is a makeup. */
  makeup_for: string | null;
  added_by: string | null;
  note: string;
}

export interface TrainingFull extends Training {
  day_blocks: DayBlock[];
  attendance: Record<string, Attendance>;
  gear: GearItem[];
  vehicles: Vehicle[];
  ammo: AmmoRow[];
  food: FoodRow[];
  chat: ChatMessage[];
  feedback: Record<string, Feedback>;
  photos: Photo[];
  drills: Drill[];
  guests: TrainingGuest[];
  approval_log: ApprovalEntry[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  all_day: boolean;
  location: string;
  training_id: string | null;
  note: string;
  source: 'manual' | 'google';
}

export interface Notification {
  id: string;
  text: string;
  time: string;
  read: boolean; // resolved per-viewer from notification_reads
  to: string[] | null; // null = everyone
  training_id: string | null;
}

export interface JoinRequest {
  id: string;
  name: string;
  rank: string;
  role: string;
  pn: string;
  phone: string;
  team_id: TeamKey;
  status: 'pending' | 'approved' | 'rejected';
  at: string;
}

/** The whole unit's state, as the screens see it. */
export interface Db {
  settings: Settings;
  teams: Record<TeamKey, Team>;
  topics: Topic[];
  people: Person[];
  trainings: TrainingFull[];
  gear_catalog: string[];
  vehicle_types: string[];
  weapons: string[];
  locations: string[];
  fleet: FleetVehicle[];
  periods: ClosedPeriod[];
  calendar: CalendarEvent[];
  notifications: Notification[];
  join_requests: JoinRequest[];
}

/** A training period after it was closed — kept as it looked on the last day. */
export interface ClosedPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  closed_at: string;
  trainings: number;
  note: string;
  summary: {
    name: string;
    role: string;
    team: string;
    rating: number;
    assigned: number;
    attended: number;
    absent: number;
    expired: number;
  }[];
}

export interface RotationConfig {
  start: string;
  weekday: string | number;
  start_time: string;
  end_time: string;
  team_weeks: number;
  joint_weeks: number;
  stagger: boolean;
  location: string;
  topics: string[];
  joint_topics: string[];
  replace: boolean;
}
