import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { parseJson, zEmail, zName, zPassword } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

const SetupSchema = z.object({
  organisationName: zName,
  name: zName,
  email: zEmail,
  password: zPassword,
});

/**
 * First run: create the organisation and its first admin.
 *
 * Open on purpose, and exactly once — the moment any user exists this route
 * refuses, so a deployment that has been set up cannot have a second
 * administrator conjured by anyone who finds the URL. The check and the insert
 * run in one transaction because two people hitting "create" together would
 * otherwise both pass it.
 */
export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const rl = rateLimit(`setup:${clientIp(req)}`, 5, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const parsed = await parseJson(req, SetupSchema);
  if (!parsed.ok) return parsed.response;

  const hash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const result = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) return null;
      const organisation = await tx.organisation.create({ data: { name: parsed.data.organisationName } });
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          password: hash,
          name: parsed.data.name,
          role: "ADMIN",
          organisationId: organisation.id,
        },
      });
      await tx.auditEvent.create({
        data: { organisationId: organisation.id, actorId: user.id, action: "setup.complete", target: `user:${user.id}` },
      });
      return user;
    });

    if (!result) return NextResponse.json({ error: "This installation has already been set up." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
    }
    throw e;
  }
});
