import { prisma } from "@/lib/prisma";

export async function audit(opts: { actorId?: string | null; action: string; target?: string | null; metadata?: unknown }) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      target: opts.target ?? null,
      metadata: opts.metadata ? (opts.metadata as any) : undefined,
    },
  }).catch(() => {});
}
