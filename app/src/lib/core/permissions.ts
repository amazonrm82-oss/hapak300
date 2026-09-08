import { ROLE_RASAP, ROLE_SERGEANT } from './constants';
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
    canEditCerts: isAdmin,
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
  if (!user.is_hapak_commander) return false;
  return !target.is_admin || target.id === user.id;
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

/** A fighter may mark only their own attendance, and only until the training starts. */
export function canMarkAttendance(
  db: Db,
  user: Person,
  t: Training,
  targetId: string,
  today: string,
): boolean {
  if (t.status === 'done' || t.status === 'cancelled') return false;
  const perms = permsFor(db, user, t);
  if (targetId === user.id) return today <= t.date;
  return perms.canApprove || perms.isTrainCmd;
}
