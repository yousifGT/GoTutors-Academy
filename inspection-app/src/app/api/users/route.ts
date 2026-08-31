import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson, zEmail, zName } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageUsers } from "@/lib/access";
import { ASSIGNABLE_ROLES, CENTRE_SCOPED_ROLES, ROLES, passwordProblem } from "@/lib/user-rules";

/** Never select `password`; it must not leave the server even hashed. */
const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  centres: { select: { id: true, name: true } },
  assignedCentres: { select: { id: true, name: true } },
  // What deleting them would take with them — see the DELETE handler.
  _count: { select: { inspections: true, deliveries: true, visits: true, uploads: true } },
};

const CreateSchema = z.object({
  email: zEmail,
  name: zName,
  password: z.string().min(1).max(200),
  role: z.enum(ROLES as [string, ...string[]]),
  /** Centres they are responsible for — only meaningful for the centre-scoped roles. */
  centreIds: z.array(z.string().min(1)).max(100).optional(),
  /** Centres they are expected to visit — only meaningful for the roles that inspect. */
  assignedCentreIds: z.array(z.string().min(1)).max(100).optional(),
});

export const GET = withRoute(async () => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageUsers(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: publicUser,
  });
  return NextResponse.json(users);
});

export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageUsers(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CreateSchema);
  if (!parsed.ok) return parsed.response;
  const { email, name, password, role, centreIds, assignedCentreIds } = parsed.data;

  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Centres only attach to the roles that are defined by them. Silently
  // ignoring them elsewhere would leave misleading data behind.
  const centres = CENTRE_SCOPED_ROLES.includes(role as never) ? (centreIds ?? []) : [];
  const assigned = ASSIGNABLE_ROLES.includes(role as never) ? (assignedCentreIds ?? []) : [];

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      password: await bcrypt.hash(password, 12),
      role: role as never,
      centres: { connect: centres.map((id) => ({ id })) },
      assignedCentres: { connect: assigned.map((id) => ({ id })) },
    },
    select: publicUser,
  });

  await audit({ actorId: who.viewer.id, action: "user.create", target: user.id, metadata: { email: user.email, role } });
  return NextResponse.json(user, { status: 201 });
});
