import type { Prisma, Role } from "@prisma/client";

/**
 * What each role may do. The handoff names six; they differ only in reach, so
 * this is a plain table rather than a permission system with its own tables.
 *
 *   SUPER_ADMIN       everything, including the checklist and user accounts
 *   HEAD_OFFICE       reads every centre, runs inspections, edits the checklist
 *   REGIONAL_MANAGER  reads and inspects the centres assigned to them
 *   FRANCHISEE        reads their own centres; does not inspect
 *   INSPECTOR         inspects anywhere; reads what they carried out
 *   READ_ONLY         reads every centre; changes nothing
 *
 * An inspector deliberately has no centre list: they visit wherever they are
 * sent, and see their own work afterwards. A franchisee is the mirror image —
 * tied to centres, but never the one holding the clipboard.
 */

export interface Viewer {
  id: string;
  role: Role;
}

/** Reads inspections for every centre. */
export function canViewAllCentres(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE" || role === "READ_ONLY";
}

/** Reads inspections for the centres assigned to them. */
export function isCentreScoped(role: Role): boolean {
  return role === "REGIONAL_MANAGER" || role === "FRANCHISEE";
}

/** Carries out inspections. */
export function canConduct(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE" || role === "REGIONAL_MANAGER" || role === "INSPECTOR";
}

/** Edits the checklist and publishes a new version. */
export function canManageTemplate(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "HEAD_OFFICE";
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
