import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";
import { canReadAudit, readableActions, type AuditGroup } from "@/lib/audit-view";

const GROUPS: AuditGroup[] = ["people", "centres", "inspections", "visits"];
const PAGE = 100;

/**
 * The audit log, read back.
 *
 * Actions are filtered to what the role may see rather than fetched and hidden
 * afterwards, so a page of results is never quietly short. Actor names and
 * inspection targets are resolved in two lookups rather than a join, because
 * AuditLog deliberately holds plain ids: it must survive the person or the
 * inspection being deleted.
 */
export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canReadAudit(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const group = url.searchParams.get("group") as AuditGroup | null;
  const actorId = url.searchParams.get("actor");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);

  const allowed = readableActions(who.viewer.role, group && GROUPS.includes(group) ? group : undefined);

  const where = {
    AND: [
      { action: { in: allowed } },
      actorId ? { actorId } : {},
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              // Inclusive of the whole end day, which is what a person means by
              // "to the 5th".
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {},
      q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { target: { contains: q } }] } : {},
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE }),
    prisma.auditLog.count({ where }),
  ]);

  // Resolve the names in one query each, not one per row.
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v)));
  const targetIds = Array.from(new Set(rows.map((r) => r.target).filter((v): v is string => !!v)));

  const [actors, inspections] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
      : [],
    targetIds.length
      ? prisma.inspection.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, date: true, centre: { select: { name: true } } },
        })
      : [],
  ]);

  const actorById = new Map(actors.map((a) => [a.id, a]));
  const inspectionById = new Map(inspections.map((i) => [i.id, i]));

  return NextResponse.json({
    total,
    skip,
    pageSize: PAGE,
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      at: r.createdAt,
      metadata: r.metadata,
      // A deleted account keeps its id in the log; say so rather than showing a
      // blank, or the record reads as though nobody did it.
      actor: r.actorId ? (actorById.get(r.actorId) ?? { id: r.actorId, name: "(deleted account)", email: null }) : null,
      target: r.target
        ? inspectionById.has(r.target)
          ? {
              id: r.target,
              kind: "inspection" as const,
              label: `${inspectionById.get(r.target)!.centre.name} — ${inspectionById
                .get(r.target)!
                .date.toISOString()
                .slice(0, 10)}`,
            }
          : { id: r.target, kind: "other" as const, label: null }
        : null,
    })),
  });
});
