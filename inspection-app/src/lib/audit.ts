import { prisma } from "@/lib/prisma";

export async function audit(opts: { actorId?: string | null; action: string; target?: string | null; metadata?: unknown }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId ?? null,
        action: opts.action,
        target: opts.target ?? null,
        metadata: opts.metadata ? (opts.metadata as any) : undefined,
      },
    });
  } catch (err) {
    // Don't fail the caller's operation on a transient audit-write error, but
    // never swallow it silently — an unobservable audit log is worthless.
    console.error("audit log write failed", { action: opts.action, target: opts.target, err });
  }
}
