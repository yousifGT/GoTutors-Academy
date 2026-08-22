import type { Prisma } from "@prisma/client";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

/**
 * Who may read which inspections.
 *
 * Three separate grants, checked in this order:
 *   - `inspection.view_all`     → every centre's inspections
 *   - `inspection.view_centre`  → inspections of the viewer's own centre
 *   - none of the above         → only the inspections they carried out
 *
 * An inspector always sees their own work, so a visiting inspector with no
 * centre of their own still gets a history. As in `scope.ts`, a null centreId
 * never widens access — it falls through to "own work only" rather than "all".
 */

export interface Viewer {
  id: string;
  centreId: string | null;
}

export interface InspectionAccess {
  viewAll: boolean;
  viewCentre: boolean;
  conduct: boolean;
  manageTemplate: boolean;
}

export async function inspectionAccess(userId: string): Promise<InspectionAccess> {
  const [viewAll, viewCentre, conduct, manageTemplate] = await Promise.all([
    userHasPermission(userId, PERMISSIONS.INSPECTION_VIEW_ALL),
    userHasPermission(userId, PERMISSIONS.INSPECTION_VIEW_CENTRE),
    userHasPermission(userId, PERMISSIONS.INSPECTION_CONDUCT),
    userHasPermission(userId, PERMISSIONS.INSPECTION_TEMPLATE_MANAGE),
  ]);
  return { viewAll, viewCentre, conduct, manageTemplate };
}

/** A Prisma `Inspection` where-filter for what this viewer may read. */
export function inspectionScope(viewer: Viewer, access: InspectionAccess): Prisma.InspectionWhereInput {
  if (access.viewAll) return {};
  if (access.viewCentre && viewer.centreId) {
    return { OR: [{ centreId: viewer.centreId }, { inspectorId: viewer.id }] };
  }
  return { inspectorId: viewer.id };
}

/** Whether this viewer may read one already-loaded inspection. */
export function canViewInspection(
  viewer: Viewer,
  access: InspectionAccess,
  inspection: { centreId: string; inspectorId: string }
): boolean {
  if (access.viewAll) return true;
  if (inspection.inspectorId === viewer.id) return true;
  return access.viewCentre && viewer.centreId != null && viewer.centreId === inspection.centreId;
}

/**
 * Whether this viewer may change one. Only the inspector who started an
 * inspection may edit it, and only while it is still a draft — a submitted
 * inspection is a record, not a document. Editing it means starting a new visit.
 */
export function canEditInspection(
  viewer: Viewer,
  access: InspectionAccess,
  inspection: { inspectorId: string; status: string }
): boolean {
  return access.conduct && inspection.inspectorId === viewer.id && inspection.status === "DRAFT";
}
