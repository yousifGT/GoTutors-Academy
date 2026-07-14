import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

export type NotifyEvent = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  centreId: string;
  courseId?: string;
};

/**
 * Sends a notification to:
 * - every centre admin in the trainee's centre
 * - the instructor (course author), if courseId is provided
 */
export async function notifyCentreAndInstructor(event: NotifyEvent): Promise<void> {
  // Notifications are best-effort: a failure here must never fail the action
  // (enrolment, quiz pass, certificate) that already committed and triggered it.
  try {
    const recipients = new Set<string>();

    if (event.centreId) {
      const admins = await prisma.user.findMany({
        where: { centreId: event.centreId, role: { type: "CENTRE_ADMIN" } },
        select: { id: true },
      });
      for (const a of admins) recipients.add(a.id);
    }
    if (event.courseId) {
      const course = await prisma.course.findUnique({ where: { id: event.courseId }, select: { authorId: true } });
      if (course?.authorId) recipients.add(course.authorId);
    }

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
