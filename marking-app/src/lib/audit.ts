import { prisma } from "@/lib/prisma";

/**
 * Who did what to whose marks.
 *
 * A failure here must never fail the action that triggered it — but it is never
 * swallowed silently either, because an unobservable audit log is worthless.
 */
export async function audit(opts: {
  organisationId: string;
  actorId?: string | null;
  action: string;
  target?: string | null;
  metadata?: unknown;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        organisationId: opts.organisationId,
        actorId: opts.actorId ?? null,
        action: opts.action,
        target: opts.target ?? null,
        metadata: opts.metadata ? (opts.metadata as never) : undefined,
      },
    });
  } catch (err) {
    console.error("audit write failed", { action: opts.action, target: opts.target, err });
  }
}
