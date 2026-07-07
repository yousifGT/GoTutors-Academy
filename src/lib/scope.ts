import { Prisma, RoleType } from "@prisma/client";

/**
 * A Prisma `User` where-filter that scopes a query to what a viewer may see:
 *
 *  - SUPER_ADMIN         → everyone (no filter)
 *  - CENTRE_ADMIN + centre → only that centre's users
 *  - CENTRE_ADMIN, no centre → NOBODY. A null centreId is a data anomaly; it must
 *    never fall back to "all users", which would leak every centre's data.
 *
 * Use it directly as the User filter, spread into a larger `where`
 * (`{ ...centreUserScope(u), role: {...} }`), or nested under a relation
 * (`{ user: centreUserScope(u) }`).
 */
export function centreUserScope(user: { roleType: RoleType; centreId: string | null }): Prisma.UserWhereInput {
  if (user.roleType === "SUPER_ADMIN") return {};
  if (!user.centreId) return { id: { in: [] } }; // matches no rows
  return { centreId: user.centreId };
}

/**
 * Whether a viewer may act on a target user. Super admins may act on anyone; a
 * centre admin may act only on TRAINEES in their own (non-null) centre. A null
 * centre on either side never grants access.
 */
export function canManageUser(
  viewer: { roleType: RoleType; centreId: string | null },
  target: { roleType: RoleType; centreId: string | null }
): boolean {
  if (viewer.roleType === "SUPER_ADMIN") return true;
  if (viewer.roleType === "CENTRE_ADMIN") {
    return target.roleType === "TRAINEE" && viewer.centreId != null && viewer.centreId === target.centreId;
  }
  return false;
}
