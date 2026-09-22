import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { generatePassword } from "@/lib/passwords";

const PatchSchema = z.object({
  name: zName.optional(),
  role: z.enum(["ADMIN", "MARKER"]).optional(),
  active: z.boolean().optional(),
  /** Set true to issue a new temporary password, returned once. */
  resetPassword: z.boolean().optional(),
});

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (viewer.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, PatchSchema);
  if (!parsed.ok) return parsed.response;

  const target = await prisma.user.findFirst({
    where: { id: params.id, organisationId: viewer.organisationId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Locking yourself out, or demoting the last admin, leaves a centre nobody can
  // administer — and there is no way back from inside the product.
  const losingAdmin =
    target.role === "ADMIN" && (parsed.data.role === "MARKER" || parsed.data.active === false);
  if (losingAdmin) {
    const admins = await prisma.user.count({
      where: { organisationId: viewer.organisationId, role: "ADMIN", active: true },
    });
    if (admins <= 1) {
      return NextResponse.json({ error: "This is the only active admin. Promote someone else first." }, { status: 409 });
    }
  }
  if (target.id === viewer.id && parsed.data.active === false) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 409 });
  }

  let temporaryPassword: string | undefined;
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.resetPassword) {
    temporaryPassword = generatePassword();
    data.password = await bcrypt.hash(temporaryPassword, 12);
    data.mustChangePassword = true;
  }

  await prisma.user.update({ where: { id: target.id }, data });
  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: parsed.data.resetPassword ? "team.password.reset" : "team.update",
    target: `user:${target.id}`,
    metadata: { email: target.email },
  });
  return NextResponse.json({ ok: true, temporaryPassword });
});
