import { PrismaClient, RoleType, VideoProvider, QuestionType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/permissions";
import { SUB_POSITIONS } from "../src/lib/sub-positions";

const prisma = new PrismaClient();

async function main() {
  // Permissions
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description: p.description },
      create: { key: p.key, label: p.label, description: p.description },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p]));

  // Roles
  const roleDefs: { name: string; type: RoleType; description: string }[] = [
    { name: "Super Admin", type: "SUPER_ADMIN", description: "Full system access" },
    { name: "Centre Admin", type: "CENTRE_ADMIN", description: "Manages a single centre" },
    { name: "Instructor", type: "INSTRUCTOR", description: "Creates and manages courses" },
    { name: "Trainee", type: "TRAINEE", description: "Takes courses" },
  ];
  const roles: Record<string, { id: string }> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { type: r.type, description: r.description },
      create: r,
    });
    roles[r.type] = { id: role.id };

    if (r.type === "TRAINEE") {
      for (const name of SUB_POSITIONS) {
        await prisma.subPosition.upsert({
          where: { roleId_name: { roleId: role.id, name } },
          update: {},
          create: { roleId: role.id, name },
        });
      }
    }

    const keys = DEFAULT_ROLE_PERMISSIONS[r.type] ?? [];
    for (const key of keys) {
      const perm = permByKey.get(key);
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: { allowed: true },
        create: { roleId: role.id, permissionId: perm.id, allowed: true },
      });
    }
  }

  // Centres
  const centreA = await prisma.centre.upsert({
    where: { id: "centre-london" },
    update: { name: "London Centre" },
    create: { id: "centre-london", name: "London Centre", location: "London, UK" },
  });
  const centreB = await prisma.centre.upsert({
    where: { id: "centre-manchester" },
    update: { name: "Manchester Centre" },
    create: { id: "centre-manchester", name: "Manchester Centre", location: "Manchester, UK" },
  });

  // Users
  const password = await bcrypt.hash("Password1!", 12);
  const mkUser = (email: string, name: string, roleType: RoleType, centreId: string | null, opts: { position?: string; subPosition?: string } = {}) =>
    prisma.user.upsert({
      where: { email },
      update: { name, roleId: roles[roleType].id, centreId, position: opts.position ?? null, subPosition: opts.subPosition ?? null },
      create: { email, name, password, roleId: roles[roleType].id, centreId, position: opts.position ?? null, subPosition: opts.subPosition ?? null },
    });

  const superAdmin = await mkUser("super@gotutors.test", "Sam Admin", "SUPER_ADMIN", null);
  const centreAdmin = await mkUser("centre@gotutors.test", "Casey Centre", "CENTRE_ADMIN", centreA.id);
  const instructor = await mkUser("instructor@gotutors.test", "Ivy Instructor", "INSTRUCTOR", centreA.id);
  const trainee = await mkUser("trainee@gotutors.test", "Tara Trainee", "TRAINEE", centreA.id, { subPosition: "Maths Tutor" });
  await mkUser("trainee2@gotutors.test", "Theo Trainee", "TRAINEE", centreB.id, { subPosition: "Science Tutor" });
  await mkUser("trainee3@gotutors.test", "Hana Head", "TRAINEE", centreA.id, { subPosition: "Head of Centre" });

  // Course
  const course = await prisma.course.upsert({
    where: { id: "course-onboarding" },
    update: { title: "Onboarding Essentials", authorId: instructor.id },
    create: {
      id: "course-onboarding",
      title: "Onboarding Essentials",
      description: "A short induction covering the basics every new trainee needs to know.",
      authorId: instructor.id,
      published: true,
      passThreshold: 70,
    },
  });

  // Wipe + recreate assignments so seed stays idempotent across schema changes
  await prisma.courseRoleAssignment.deleteMany({ where: { courseId: course.id } });
  await prisma.courseRoleAssignment.createMany({
    data: [
      { courseId: course.id, roleId: roles.TRAINEE.id, subPosition: "Maths Tutor" },
      { courseId: course.id, roleId: roles.TRAINEE.id, subPosition: "Science Tutor" },
      { courseId: course.id, roleId: roles.TRAINEE.id, subPosition: "English Tutor" },
      { courseId: course.id, roleId: roles.TRAINEE.id, subPosition: "11+ Tutor" },
    ],
  });

  // Wipe + recreate modules/lessons for idempotency
  await prisma.module.deleteMany({ where: { courseId: course.id } });

  const m1 = await prisma.module.create({ data: { courseId: course.id, title: "Welcome", order: 0 } });
  const m2 = await prisma.module.create({ data: { courseId: course.id, title: "Core skills", order: 1 } });

  const lesson1 = await prisma.lesson.create({
    data: {
      moduleId: m1.id, title: "Welcome to GoTutors", order: 0,
      content: "A short intro from your team.",
      video: { create: { provider: "YOUTUBE" as VideoProvider, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      quiz: {
        create: {
          passThreshold: 70, retryLimit: 3,
          questions: {
            create: [
              {
                type: "MULTIPLE_CHOICE" as QuestionType, prompt: "What is the name of this academy?", points: 1, order: 0,
                answers: { create: [
                  { text: "GoTutors Academy", isCorrect: true },
                  { text: "EduWorld", isCorrect: false },
                  { text: "LearnNow", isCorrect: false },
                ] },
              },
              {
                type: "OPEN_ENDED" as QuestionType, prompt: "Type the word 'ready' to continue.", points: 1, order: 1,
                answers: { create: [{ text: "ready", isCorrect: true }] },
              },
            ],
          },
        },
      },
    },
  });
  await prisma.lesson.create({
    data: {
      moduleId: m1.id, title: "Your dashboard", order: 1,
      content: "How to navigate your dashboard.",
      video: { create: { provider: "YOUTUBE" as VideoProvider, url: "https://www.youtube.com/watch?v=ScMzIvxBSi4" } },
      quiz: {
        create: {
          passThreshold: 70, retryLimit: 3,
          questions: { create: [
            {
              type: "MULTIPLE_CHOICE" as QuestionType, prompt: "Where do you see course progress?", points: 1, order: 0,
              answers: { create: [
                { text: "On each course card", isCorrect: true },
                { text: "On the login page", isCorrect: false },
              ] },
            },
          ] },
        },
      },
    },
  });
  await prisma.lesson.create({
    data: {
      moduleId: m2.id, title: "Working with quizzes", order: 0,
      content: "Quizzes unlock once the video is watched.",
      video: { create: { provider: "YOUTUBE" as VideoProvider, url: "https://www.youtube.com/watch?v=tgbNymZ7vqY" } },
      quiz: {
        create: {
          passThreshold: 70, retryLimit: 3,
          questions: { create: [
            {
              type: "MULTIPLE_CHOICE" as QuestionType, prompt: "How many retries are allowed by default?", points: 1, order: 0,
              answers: { create: [
                { text: "3", isCorrect: true },
                { text: "Unlimited", isCorrect: false },
                { text: "1", isCorrect: false },
              ] },
            },
          ] },
        },
      },
    },
  });

  // Enroll trainee
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: trainee.id, courseId: course.id } },
    update: {},
    create: { userId: trainee.id, courseId: course.id },
  });

  // Seed a notification
  await prisma.notification.create({
    data: {
      userId: centreAdmin.id,
      centreId: centreA.id,
      type: "TRAINEE_ENROLLED",
      title: `${trainee.name} enrolled in ${course.title}`,
      link: `/centre/trainees/${trainee.id}`,
    },
  }).catch(() => {});

  console.log("Seed complete. Demo logins (password: Password1!):");
  console.log(" super@gotutors.test (Super Admin)");
  console.log(" centre@gotutors.test (Centre Admin, London)");
  console.log(" instructor@gotutors.test (Instructor)");
  console.log(" trainee@gotutors.test (Trainee, London, Maths Tutor)");
  console.log(" trainee3@gotutors.test (Trainee, London, Head of Centre)");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
