import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * A worked demo: one centre, two people, three students, and a real mark scheme.
 *
 * Deliberately idempotent — running it twice changes nothing — so it is safe to
 * point at a development database repeatedly. It never touches a database that
 * already has an organisation it did not create.
 */
const prisma = new PrismaClient();

const DEMO_ORG_ID = "demo-centre";

async function main() {
  const password = await bcrypt.hash("MarkerDemo123", 12);

  const organisation = await prisma.organisation.upsert({
    where: { id: DEMO_ORG_ID },
    update: { name: "Demo Tutoring Centre" },
    create: { id: DEMO_ORG_ID, name: "Demo Tutoring Centre" },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.test" },
    update: { organisationId: organisation.id, role: "ADMIN" },
    create: {
      email: "admin@demo.test",
      name: "Amara Osei",
      password,
      role: "ADMIN",
      organisationId: organisation.id,
    },
  });

  const marker = await prisma.user.upsert({
    where: { email: "tutor@demo.test" },
    update: { organisationId: organisation.id, role: "MARKER" },
    create: {
      email: "tutor@demo.test",
      name: "Tom Whitfield",
      password,
      role: "MARKER",
      organisationId: organisation.id,
    },
  });

  const students = [
    { id: "demo-student-1", name: "Priya Raman", yearGroup: "Year 6", tutorId: marker.id },
    { id: "demo-student-2", name: "Jacob Mensah", yearGroup: "Year 6", tutorId: marker.id },
    { id: "demo-student-3", name: "Elif Demir", yearGroup: "Year 5", tutorId: admin.id },
  ];
  for (const s of students) {
    await prisma.student.upsert({
      where: { id: s.id },
      update: { name: s.name, yearGroup: s.yearGroup },
      create: { ...s, organisationId: organisation.id },
    });
  }

  const scheme = await prisma.markScheme.upsert({
    where: { id: "demo-scheme-1" },
    update: {},
    create: {
      id: "demo-scheme-1",
      organisationId: organisation.id,
      ownerId: admin.id,
      title: "Year 6 Arithmetic — Paper 1",
      subject: "Maths",
      level: "Year 6 / KS2",
      shared: true,
    },
  });

  const questions = [
    {
      label: "1",
      prompt: "Work out 3/4 of 60",
      expectedAnswer: "45",
      marks: 2,
      guidance: "1 mark for dividing by 4 (15), 1 mark for the final answer. Accept 45 written anywhere in the working.",
    },
    {
      label: "2",
      prompt: "Round 4,738 to the nearest hundred",
      expectedAnswer: "4,700",
      marks: 1,
      guidance: "Accept 4700 with or without a comma. Do not accept 4,800.",
    },
    {
      label: "3a",
      prompt: "A shape has 5 equal sides of 6.4 cm. What is its perimeter?",
      expectedAnswer: "32 cm",
      marks: 2,
      guidance: "1 mark for 6.4 × 5, 1 mark for 32. Accept 32 without units; deduct nothing for cm written as CM.",
    },
    {
      label: "3b",
      prompt: "Explain how you worked out your answer to 3a.",
      expectedAnswer: "Multiplied the side length by the number of sides.",
      marks: 1,
      guidance:
        "1 mark for any answer that says the side length was multiplied by 5, however informally phrased. Spelling is not assessed.",
    },
  ];
  for (const [i, q] of questions.entries()) {
    await prisma.markSchemeQuestion.upsert({
      where: { markSchemeId_label: { markSchemeId: scheme.id, label: q.label } },
      update: { ...q, order: i },
      create: { ...q, order: i, markSchemeId: scheme.id },
    });
  }

  console.log("Seeded:");
  console.log("  admin@demo.test / MarkerDemo123   (admin)");
  console.log("  tutor@demo.test / MarkerDemo123   (marker)");
  console.log("  3 students, 1 mark scheme with 4 questions");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
