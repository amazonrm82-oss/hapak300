import { ROLE_RASAP, ROLE_SERGEANT, STAFF_ROLES } from './constants';
import type { Db, Person, Training } from './types';

/**
 * The permission matrix, ported 1:1 from `permsFor` in the prototype's
 * hapak-core.js. The UI reads these; the database enforces the same rules in
 * RLS (see supabase/migrations/0002_rls.sql) so a hidden button is never the
 * only thing standing between a fighter and someone else's data.
 */
export interface Perms {
  isAdmin: boolean;
  isSysAdmin: boolean;
  isTeamCmd: boolean;
  isTrainCmd: boolean;
  isInstr: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canInvite: boolean;
  canSummarize: boolean;
  canApprove: boolean;
  canManagePeople: boolean;
  canManagePeriod: boolean;
  canGrantRoles: boolean;
  canDeleteTraining: boolean;
  canEditCerts: boolean;
  canCalendar: boolean;
  seesFeedback: boolean;
  canExport: boolean;
  seesStats: boolean;
  seesPN: boolean;
  seesList: boolean;
  canPin: boolean;
  canSignAmmo: boolean;
  isRasap: boolean;
  isSergeant: boolean;
  /** The logistics of a training: gear, vehicles, ammunition, food. */
  canLogistics: boolean;
  /** The standing lists behind them: the fleet, the catalogs. */
  canCatalogs: boolean;
  /** Weapon, weapon serial and certifications on anyone's card — and nothing else. */
  canEditKit: boolean;
  /** Attach a fighter to another team's training, or arrange a makeup. */
  canGuest: boolean;
  /** The צל״ם list of one team — a sergeant and above. */
  canKitReport: boolean;
  /** The צל״ם list of the whole unit — a team commander and above. */
  canKitReportAll: boolean;
}

// `_db` is kept in the signature so every call site reads the same as the
// prototype's `permsFor(db, user, t)`; the rules themselves need only the person
// and the training.
export function permsFor(_db: Db, user: Person | null, t: Training | null): Perms {
  const isAdmin = !!(user && (user.is_admin || user.is_hapak_commander));
  const isTeamCmd = !!(
    user &&
    user.is_team_commander &&
    (!t || t.team_id === user.team_id || t.team_id === 'joint')
  );
  const isTrainCmd = !!(t && user && t.commander_id === user.id);
  const isInstr = !!(t && user && t.instructor_id === user.id);
  const isAnyTeamCmd = !!(user && user.is_team_commander);
  const isRasap = user?.role === ROLE_RASAP;
  const isSergeant = user?.role === ROLE_SERGEANT;

  return {
    isAdmin,
    isSysAdmin: !!user?.is_admin,
    isTeamCmd,
    isTrainCmd,
    isInstr,
    canEdit: isAdmin || isTeamCmd || isTrainCmd || isInstr,
    canCreate: isAdmin || isAnyTeamCmd,
    canInvite: isAdmin || isTeamCmd || isTrainCmd,
    canSummarize: isAdmin || isTrainCmd,
    // on a joint training the training commander approves everyone; otherwise
    // it is the team commander's call
    canApprove: !!t && (isAdmin || (t.team_id === 'joint' ? isTrainCmd : isTeamCmd)),
    canManagePeople: isAdmin,
    canManagePeriod: isAdmin,
    canGrantRoles: isAdmin,
    canDeleteTraining: isAdmin,
    canEditCerts: isAdmin || isAnyTeamCmd,
    canCalendar: isAdmin,
    seesFeedback: isAdmin || isTeamCmd || isTrainCmd || isInstr,
    canExport: isAdmin || isAnyTeamCmd || isTrainCmd,
    seesStats: isAdmin || isAnyTeamCmd || isTrainCmd || isInstr,
    seesPN: isAdmin || isAnyTeamCmd || isTrainCmd,
    seesList: isAdmin || isAnyTeamCmd || isTrainCmd || isInstr,
    canPin: isAdmin || isTeamCmd || isTrainCmd,
    canSignAmmo: isAdmin || isTrainCmd,
    isRasap,
    isSergeant,
    canLogistics: isAdmin || isTeamCmd || isTrainCmd || isInstr || isRasap,
    canCatalogs: isAdmin || isAnyTeamCmd || isRasap,
    canEditKit: isAdmin || isSergeant,
    canGuest: isAdmin || isAnyTeamCmd,
    // serial numbers of controlled items: whoever signs for them, and above
    canKitReport: isAdmin || isAnyTeamCmd || isSergeant,
    canKitReportAll: isAdmin || isAnyTeamCmd,
  };
}

/**
 * The system administrator outranks the HQ-party commander: an administrator may
 * edit, demote or remove a commander, but not the other way round. Enforced in
 * the database by `guard_admin_rank` — this is only what the buttons obey.
 */
export function canEditPerson(user: Person | null, target: Person): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  if (user.is_hapak_commander) return !target.is_admin || target.id === user.id;
  // a team commander runs his own team's cards: every detail on them, but none
  // of the four rights that would appoint someone alongside or above him
  return !!(user.is_team_commander && user.team_id && target.team_id === user.team_id);
}

/**
 * May this person touch that card's kit at all?
 *
 * `canEditKit` says the viewer holds the right; this says the card is within
 * reach. Rank still applies: only a system administrator edits a system
 * administrator, and the database enforces exactly that. Without this the
 * roster offered an HQ-party commander a ״נשק והכשרות״ button on the
 * administrator's card — a button that could only ever end in a refusal.
 */
/**
 * May this person be placed in the מפקדה — that is, outside any team?
 *
 * The מפקדה is a table of organisation and not a place to park people: the
 * brigade commander and his deputy stand there, and so do the two who run the
 * system — the administrator and the HQ-party commander — by their post.
 * Everyone else belongs to a team.
 */
export function fitsStaff(p: {
  role: string;
  is_admin: boolean;
  is_hapak_commander: boolean;
}): boolean {
  return (
    p.is_admin || p.is_hapak_commander || (STAFF_ROLES as readonly string[]).includes(p.role)
  );
}

/** And who may put someone there: the two who answer for the unit's structure. */
export const canSetStaff = (user: Person | null): boolean =>
  !!user && (user.is_admin || user.is_hapak_commander);

export function canEditKitOf(db: Db, user: Person | null, target: Person): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  if (target.is_admin) return false;
  return permsFor(db, user, null).canEditKit;
}

/** Appointing a commander, an instructor or an administrator — never a team commander's. */
export function canGrantRights(user: Person | null): boolean {
  return !!(user && (user.is_admin || user.is_hapak_commander));
}

export function roleLabel(db: Db, p: Person | null): string {
  if (!p) return '';
  if (p.is_admin && p.is_hapak_commander) return 'מפקד החפ״ק · מנהל מערכת';
  if (p.is_admin) return 'מנהל מערכת';
  if (p.is_hapak_commander) return 'מפקד החפ״ק';
  if (p.is_team_commander) {
    const team = p.team_id ? db.teams[p.team_id]?.name : null;
    return team ? `מפקד ${team}` : 'מפקד צוות';
  }
  const team = p.team_id ? db.teams[p.team_id]?.name : 'מפקדה';
  return `${p.role} · ${team}`;
}

/**
 * Who may still set an attendance mark.
 *
 * A fighter answers for himself, once. After he has answered, the line is his
 * commander's: a force built on a number that people can quietly revise the
 * night before is not a number anyone can plan around, and "I changed it back"
 * is exactly the argument the commander should not have to have. Changing it is
 * a commander's update, and it is logged as one.
 */
export function canMarkAttendance(
  db: Db,
  user: Person,
  t: Training & { attendance?: Record<string, unknown> },
  targetId: string,
  today: string,
): boolean {
  if (t.status === 'done' || t.status === 'cancelled') return false;
  const perms = permsFor(db, user, t);
  if (perms.canApprove || perms.isTrainCmd) return true;
  if (targetId !== user.id) return false;
  return today <= t.date && !t.attendance?.[user.id];
}
