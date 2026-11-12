import { isCourseExpired } from "../lib/course-expiry.js";
import { publishCourseRemoved } from "../lib/chat-events.js";
import type { ArchivedCourseDTO } from "@rozenblum/shared";
import type { Pagination } from "../lib/pagination.js";
import { logger } from "../lib/logger.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourseArchive } from "../types.js";
import { safeCourseState } from "./audit.js";

export type ArchiveResult = "archived" | "not_due" | "payment_pending" | "changed";

export async function listArchivedCourses(page?: Pagination): Promise<{
  items: ArchivedCourseDTO[]; total: number;
}> {
  const repo = getRepositories().courseArchives;
  const [archives, total] = await Promise.all([repo.list(page), repo.count()]);
  return {
    total,
    items: archives.map((archive) => ({
      id: archive.courseId, title: archive.title, professor: archive.professor,
      expiresOn: archive.expiresOn, archivedAt: archive.archivedAt,
      enrollments: archive.enrollmentCount, completed: archive.completedCount,
      completion: archive.lessonCount > 0
        ? Math.round(archive.averageCompletedLessons / archive.lessonCount * 100) : 0,
      conversations: archive.conversationCount, messages: archive.messageCount,
    })),
  };
}

/** Archive the course and remove access and chats as one database transaction. */
export async function archiveExpiredCourse(courseId: number): Promise<ArchiveResult> {
  const repos = getRepositories();
  const result = await repos.withTransaction(async () => {
    const course = await repos.courses.findById(courseId);
    if (!course?.expiresOn || !isCourseExpired(course)) return "not_due";
    // An unsettled Mercado Pago preference may still be paid after midnight.
    if (await repos.orders.hasUnsettledPaymentByCourse(courseId)) return "payment_pending";

    const enrollment = await repos.enrollments.archiveSummary(courseId);
    const chat = await repos.conversations.archiveSummary(courseId);
    const archive: StoredCourseArchive = {
      courseId, slug: course.slug, title: course.title,
      professor: course.professor, professorEmail: course.professorEmail,
      priceCents: course.priceCents, createdAt: course.createdAt,
      expiresOn: course.expiresOn, archivedAt: nowIso(),
      lessonCount: course.modules.reduce((total, mod) => total + mod.lessons.length, 0),
      ...enrollment, ...chat,
    };
    if (!await repos.courses.deleteExpired(courseId, course.expiresOn, course.revision ?? 0)) {
      return "changed";
    }
    await repos.courseArchives.create(archive);
    await repos.enrollments.deleteByCourse(courseId);
    await repos.conversations.deleteByCourse(courseId);
    await repos.adminEvents.create({
      id: newId("aud"), actorId: "system", actorEmail: "sistema",
      action: "delete", entity: "course", entityId: String(courseId),
      previousState: safeCourseState(course),
      nextState: { archived: true, archiveId: courseId },
      reason: "Retiro automático por vencimiento.", createdAt: nowIso(),
    });
    return "archived";
  });
  if (result === "archived") publishCourseRemoved(courseId);
  return result;
}

/** Re-run from the first ID each pass; this also catches expiries while the API was down. */
export async function archiveDueCourses(): Promise<void> {
  const repos = getRepositories();
  let afterId = 0;
  while (true) {
    const ids = await repos.courses.listExpiredIds(afterId, 100);
    if (ids.length === 0) return;
    for (const id of ids) {
      try {
        const result = await archiveExpiredCourse(id);
        if (result === "archived") logger.info("course_archived", { courseId: id });
        if (result === "payment_pending") logger.warn("course_archive_waiting_payment", { courseId: id });
      } catch (error) {
        logger.error("course_archive_failed", {
          courseId: id, message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    afterId = ids[ids.length - 1];
  }
}
