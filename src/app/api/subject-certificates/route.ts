import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCertificate } from "@/lib/scope";
import { getFieldStatus } from "@/lib/field-training";
import { subjectCertificate } from "@/lib/subject-certificate";
import { subjectCertificateSerial } from "@/lib/subject-certificate-serial";
import { renderSubjectCertificatePdf } from "@/lib/certificate-pdf";

/**
 * The PDF for a subject qualification.
 *
 * Query params rather than a path segment: field names contain "&" and spaces
 * ("Calling & Customer Service"), which a path segment handles badly.
 *
 * The subject is re-derived here rather than trusted from the caller — the
 * status the page rendered could be minutes old, and a course published in the
 * meantime must stop the certificate being issued.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const field = url.searchParams.get("field");
  if (!userId || !field) {
    return NextResponse.json({ error: "userId and field are required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, centreId: true, supervisorId: true, roleId: true,
      subPosition: true, subPositions: true, teacherPositions: true,
      role: { select: { type: true } },
    },
  });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canViewCertificate(session.user, target)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = (await getFieldStatus(target)).find((f) => f.name === field);
  if (!status) {
    return NextResponse.json({ error: "That subject is not held by this user" }, { status: 404 });
  }

  const cert = subjectCertificate({ ...status, lastCertifiedAt: status.lastCertifiedAt });
  if (!cert.downloadable || !status.lastCertifiedAt) {
    return NextResponse.json(
      { error: `Not qualified in ${field} yet — ${cert.done}/${cert.total} courses done` },
      { status: 409 }
    );
  }

  const serial = subjectCertificateSerial(target.id, field);
  const pdf = await renderSubjectCertificatePdf({
    name: target.name,
    field,
    serial,
    qualifiedAt: new Date(status.lastCertifiedAt),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="qualification-${serial}.pdf"`,
    },
  });
}
