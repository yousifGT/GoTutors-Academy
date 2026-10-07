import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

export type NotifyEvent = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  centreId: string;
  courseId?: string;
  /**
   * Whose learning this is about. Decides who hears about it (see below) and is
   * never notified about their own attempt.
   */
  learnerId?: string;
};

/**
 * Sends a notification to the people who can act on it:
 *
 * - for a trainee: every centre admin in their centre;
 * - for anyone else (a head of centre, an instructor, an admin taking a
 *   course): the super admins instead. Centre admins may only manage trainees
 *   (canManageUser), so they could not unlock a head's quiz, and a head's
 *   results are not their peers' business — centre reports are trainees only;
 * - plus the course author, if courseId is provided.
 *
 * The learner is always removed: a head who fails a quiz used to be told that
 * they themselves "need a quiz retry unlock" — a button they are not allowed
 * to press.
 */
export async function notifyCentreAndInstructor(event: NotifyEvent): Promise<void> {
  // Notifications are best-effort: a failure here must never fail the action
  // (enrolment, quiz pass, certificate) that already committed and triggered it.
  try {
    const recipients = new Set<string>();

    const learner = event.learnerId
      ? await prisma.user.findUnique({ where: { id: event.learnerId }, select: { role: { select: { type: true } } } })
      : null;
    // Without a learnerId the caller predates this rule; keep the old routing.
    const learnerIsTrainee = !learner || learner.role.type === "TRAINEE";

    if (learnerIsTrainee) {
      if (event.centreId) {
        const admins = await prisma.user.findMany({
          where: { centreId: event.centreId, role: { type: "CENTRE_ADMIN" } },
          select: { id: true },
        });
        for (const a of admins) recipients.add(a.id);
      }
    } else {
      const supers = await prisma.user.findMany({
        where: { active: true, role: { type: "SUPER_ADMIN" } },
        select: { id: true },
      });
      for (const s of supers) recipients.add(s.id);
    }
    if (event.courseId) {
      const course = await prisma.course.findUnique({ where: { id: event.courseId }, select: { authorId: true } });
      if (course?.authorId) recipients.add(course.authorId);
    }
    if (event.learnerId) recipients.delete(event.learnerId);

    if (recipients.size === 0) return;
    await prisma.notification.createMany({
      data: Array.from(recipients).map((userId) => ({
        userId,
        centreId: event.centreId,
        type: event.type,
        title: event.title,
        body: event.body ?? null,
        link: event.link ?? null,
      })),
    });
  } catch (err) {
    console.error("notifyCentreAndInstructor failed", { type: event.type, centreId: event.centreId, err });
  }
}
