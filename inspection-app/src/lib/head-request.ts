import { prisma } from "@/lib/prisma";

/**
 * Making somebody head of a centre.
 *
 * One function, called from two places — a super admin setting heads directly,
 * and a super admin approving a franchisee's request — so the two cannot drift
 * into applying different rules. Everything that makes the change safe to
 * delegate lives here:
 *
 *   - the person must already have an active CENTRE_HEAD account, checked
 *     against the database rather than trusted from the request, so no caller
 *     can create a login, set a password, or promote anybody;
 *   - managers who are not heads of centre — the franchisee themselves, a
 *     regional manager — are preserved untouched, so nobody can be removed from
 *     a centre through this path, by accident or otherwise.
 *
 * Returns the heads that were in place before, so callers can record what
 * actually changed rather than what was asked for.
 */
export async function setCentreHeads(
  centreId: string,
  headIds: string[]
): Promise<
  | { ok: false; error: string }
  | { ok: true; was: { id: string; name: string }[]; now: { id: string; name: string }[]; managers: Manager[] }
> {
  const wanted = Array.from(new Set(headIds));

  const centre = await prisma.centre.findUnique({
    where: { id: centreId },
    select: { id: true, managers: { select: { id: true, name: true, role: true } } },
  });
  if (!centre) return { ok: false, error: "not found" };

  const heads = await prisma.user.findMany({
    where: { id: { in: wanted }, role: "CENTRE_HEAD", active: true },
    select: { id: true, name: true },
  });
  if (heads.length !== wanted.length)
    return {
      ok: false,
      error: "Only people who already have an active head of centre account can be assigned.",
    };

  const others = centre.managers.filter((m) => m.role !== "CENTRE_HEAD");
  const updated = await prisma.centre.update({
    where: { id: centre.id },
    data: { managers: { set: [...others.map((m) => ({ id: m.id })), ...heads.map((h) => ({ id: h.id }))] } },
    select: { managers: { select: { id: true, name: true, role: true, email: true } } },
  });

  return {
    ok: true,
    was: centre.managers.filter((m) => m.role === "CENTRE_HEAD").map((m) => ({ id: m.id, name: m.name })),
    now: heads,
    managers: updated.managers,
  };
}

export interface Manager {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** For an audit entry: names, or the word for none of them. */
export function nameList(people: { name: string }[]): string {
  return people.map((p) => p.name).join(", ") || "nobody";
}
