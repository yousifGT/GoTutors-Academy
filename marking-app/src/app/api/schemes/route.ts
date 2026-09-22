import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { parseJson } from "@/lib/validate";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { SchemeSchema, duplicateLabel } from "@/lib/marking/scheme-schema";

export const POST = withRoute(async (req: Request) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, SchemeSchema);
  if (!parsed.ok) return parsed.response;

  const clash = duplicateLabel(parsed.data.questions);
  if (clash) return NextResponse.json({ error: `Two questions are both labelled "${clash}".` }, { status: 409 });

  const scheme = await prisma.markScheme.create({
    data: {
      organisationId: viewer.organisationId,
      title: parsed.data.title,
      subject: parsed.data.subject,
      level: parsed.data.level || null,
      shared: parsed.data.shared ?? true,
      ownerId: viewer.id,
      questions: {
        create: parsed.data.questions.map((q, i) => ({
          order: i,
          label: q.label.trim(),
          prompt: q.prompt,
          expectedAnswer: q.expectedAnswer,
          marks: q.marks,
          guidance: q.guidance || null,
        })),
      },
    },
  });

  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "scheme.create",
    target: `scheme:${scheme.id}`,
    metadata: { title: scheme.title, questions: parsed.data.questions.length },
  });
  return NextResponse.json({ id: scheme.id });
});
