import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { parseJson, zName } from "@/lib/validate";

/** Thrown inside the delete transaction when the centre still has users. */
class CentreHasUsersError extends Error {}

const CentrePatchSchema = z.object({
  name: zName.optional(),
  location: z.string().max(200).nullish(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.CENTRE_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CentrePatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const data: Prisma.CentreUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.location !== undefined) data.location = body.location || null;

  try {
    const updated = await prisma.centre.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "not found" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.CENTRE_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Never cascade-delete users. Refuse while any user is attached, and do the
  // check + delete in one serializable transaction so a user can't be assigned
  // to the centre between the count and the delete.
  try {
    await prisma.$transaction(
      async (tx) => {
        const users = await tx.user.count({ where: { centreId: params.id } });
        if (users > 0) throw new CentreHasUsersError();
        await tx.centre.delete({ where: { id: params.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    if (e instanceof CentreHasUsersError)
      return NextResponse.json(
        { error: "Cannot delete a centre while users are assigned to it. Reassign or remove them first." },
        { status: 409 }
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2025: centre already gone. P2003: a user FK still references it (race).
      // P2034: serialization conflict from a concurrent write.
      if (e.code === "P2025") return NextResponse.json({ error: "not found" }, { status: 404 });
      if (e.code === "P2003")
        return NextResponse.json(
          { error: "Cannot delete a centre while users are assigned to it. Reassign or remove them first." },
          { status: 409 }
        );
      if (e.code === "P2034") return NextResponse.json({ error: "Concurrent update, please retry" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
