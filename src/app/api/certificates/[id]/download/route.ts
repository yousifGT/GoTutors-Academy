import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderCertificatePdf } from "@/lib/certificate-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { user: { include: { centre: true, supervisor: true } }, course: true },
  });
  if (!cert) return NextResponse.json({ error: "not found" }, { status: 404 });

  const viewer = session.user;
  const allowed =
    viewer.id === cert.userId ||
    viewer.roleType === "SUPER_ADMIN" ||
    (viewer.roleType === "CENTRE_ADMIN" && viewer.centreId != null && viewer.centreId === cert.user.centreId) ||
    (viewer.id === cert.user.supervisorId);

  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pdf = await renderCertificatePdf({
    name: cert.user.name,
    courseTitle: cert.course.title,
    serial: cert.serial,
    issuedAt: cert.issuedAt,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="certificate-${cert.serial}.pdf"`,
    },
  });
}
