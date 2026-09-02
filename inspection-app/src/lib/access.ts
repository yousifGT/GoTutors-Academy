import type { Prisma, Role } from "@prisma/client";

/**
 * What each role may do. The handoff names six; they differ only in reach, so
 * this is a plain table rather than a permission system with its own tables.
 *
 *   SUPER_ADMIN       everything, including the checklist and user accounts
 *   HEAD_OFFICE       reads every centre, runs inspections, manages centres
 *   REGIONAL_MANAGER  reads and inspects the centres assigned to them
 *   FRANCHISEE        reads their own centres; does not inspect
 *   CENTRE_HEAD       runs a centre: reads its inspections, never runs one
 *   INSPECTOR         inspects anywhere; reads what they carried out
 *   READ_ONLY         reads every centre; changes nothing
 *
 * An inspector's centre assignment says where their work is, not what they may
 * read — they can still be sent anywhere, and they see their own visits
 * wherever those were. A head of centre is the mirror image: tied to one site,
 * never the one holding the clipboard, because a centre cannot inspect itself.
 */

export interface Viewer {
  id: string;
  role: Role;
}

/** Reads inspections for every centre. */
export function canViewAllCentres(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE" || role === "READ_ONLY";
}

/** People who receive a report when their centre is inspected. */
export function receivesReports(role: Role): boolean {
  return role === "CENTRE_HEAD" || role === "FRANCHISEE" || role === "REGIONAL_MANAGER";
}

/** Reads inspections for the centres assigned to them. */
export function isCentreScoped(role: Role): boolean {
  return role === "REGIONAL_MANAGER" || role === "FRANCHISEE" || role === "CENTRE_HEAD";
}

/** Carries out inspections. */
export function canConduct(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE" || role === "REGIONAL_MANAGER" || role === "INSPECTOR";
}

/**
 * Edits the checklist and publishes a new version.
 *
 * The super admin alone. The checklist is what every inspection is scored
 * against and what a critical finding is defined by, so a change to it reaches
 * backwards through every comparison the reports draw and forwards into every
 * visit still to come — a wider blast radius than adding a centre or a person.
 * Head office runs the operation and reads all of it; setting the standard the
 * operation is judged against is a separate decision, and is kept with the one
 * role that also holds account administration.
 */
export function canManageTemplate(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

/** Creates and edits user accounts and centres. */
export function canManageUsers(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

export function canManageCentres(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE";
}

/**
 * A Prisma `Inspection` where-filter for what this viewer may read.
 *
 * A centre-scoped viewer with no centres assigned sees only their own work, not
 * everything — an empty assignment list is a gap in the data, and must never
 * fall open.
 */
export function inspectionScope(viewer: Viewer): Prisma.InspectionWhereInput {
  if (canViewAllCentres(viewer.role)) return {};
  if (isCentreScoped(viewer.role)) {
    return { OR: [{ centre: { managers: { some: { id: viewer.id } } } }, { inspectorId: viewer.id }] };
  }
  return { inspectorId: viewer.id };
}

/** A Prisma `Centre` where-filter for the centres this viewer may see. */
export function centreScope(viewer: Viewer): Prisma.CentreWhereInput {
  if (canViewAllCentres(viewer.role)) return {};
  // An inspector may be sent anywhere, so they see the whole list to pick from.
  if (viewer.role === "INSPECTOR") return {};
  return { managers: { some: { id: viewer.id } } };
}

/**
 * Whether this viewer may change an inspection. Only the inspector who started
 * it, and only while it is still a draft — a submitted inspection is a record,
 * not a document. Correcting one means carrying out another visit.
 */
export function canEditInspection(
  viewer: Viewer,
  inspection: { inspectorId: string; status: string }
): boolean {
  return canConduct(viewer.role) && inspection.inspectorId === viewer.id && inspection.status === "DRAFT";
}
