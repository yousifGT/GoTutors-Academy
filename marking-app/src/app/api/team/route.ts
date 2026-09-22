import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson, zEmail, zName } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { generatePassword } from "@/lib/passwords";

const MemberSchema = z.object({ name: zName, email: zEmail, role: z.enum(["ADMIN", "MARKER"]) });

/**
 * Add someone to the centre.
 *
 * They get a generated temporary password, shown to the admin exactly once, and
 * `mustChangePassword` set — so a password two people know cannot quietly
 * become permanent.
 */
export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (viewer.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, MemberSchema);
  if (!parsed.ok) return parsed.response;

  const password = generatePassword();
  try {
    const user = await prisma.user.create({
      data: {
        organisationId: viewer.organisationId,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        password: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      },
    });
    await audit({
      organisationId: viewer.organisationId,
      actorId: viewer.id,
      action: "team.create",
      target: `user:${user.id}`,
      metadata: { email: user.email, role: user.role },
    });
    return NextResponse.json({ id: user.id, temporaryPassword: password });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Someone already uses that email address." }, { status: 409 });
    }
    throw e;
  }
});
