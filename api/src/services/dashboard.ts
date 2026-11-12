import type {
  AdminDashboardDTO,
  AdminInscripcionDTO,
  AdminOverviewDTO,
  AdminReportesDTO,
  MonthlySeriesDTO,
  TeacherCourseDTO,
  TeacherDashboardDTO,
  TeacherNotificationDTO,
  TeacherStudentDTO,
} from "@rozenblum/shared";
import { isCourseExpired } from "../lib/course-expiry.js";
import { formatArs, formatShortDate, formatTime } from "../lib/utils.js";
import type { Pagination } from "../lib/pagination.js";
import { getRepositories } from "../repositories/index.js";
import type { EnrollmentMetrics, OrderMetrics } from "../repositories/interfaces.js";
import type { StoredCourse, StoredCourseArchive, StoredEnrollment, StoredMessage, StoredUser } from "../types.js";
import {
  adminAlumno,
  adminCurso,
  adminProfesor,
  computeProgress,
  courseIndex,
  enrollmentToDTO,
  orderToDTO,
} from "./mappers.js";
import { canManageCourse, loadManagedCourse } from "./courses.js";

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const withinDays = (iso: string, days: number) =>
  Date.now() - new Date(iso).getTime() <= days * DAY;

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** Average progress across enrollments that may belong to different courses. */
function averageProgressFor(
  courses: StoredCourse[],
  enrollments: StoredEnrollment[],
): number {
  if (enrollments.length === 0) return 0;
  const byId = courseIndex(courses);
  const sum = enrollments.reduce((total, enrollment) => {
    const course = byId.get(enrollment.courseId);
    return total + (course ? computeProgress(course, enrollment.completedLessonIds) : 0);
  }, 0);
  return Math.round(sum / enrollments.length);
}

function courseEnrollments(
  courses: StoredCourse[],
  enrollments: StoredEnrollment[],
): Map<number, StoredEnrollment[]> {
  const ids = new Set(courses.map((course) => course.legacyId));
  const map = new Map<number, StoredEnrollment[]>();
  for (const enrollment of enrollments) {
    if (!ids.has(enrollment.courseId)) continue;
    const list = map.get(enrollment.courseId) ?? [];
    list.push(enrollment);
    map.set(enrollment.courseId, list);
  }
  return map;
}

function avgProgress(course: StoredCourse, enrollments: StoredEnrollment[]): number {
  if (enrollments.length === 0) return 0;
  const sum = enrollments.reduce(
    (total, enrollment) => total + computeProgress(course, enrollment.completedLessonIds),
    0,
  );
  return Math.round(sum / enrollments.length);
}

function totalLessonsOf(course: StoredCourse): number {
  return course.modules.reduce((sum, mod) => sum + mod.lessons.length, 0);
}

/** Legacy messages used `from: "me"` for the student; new ones store authorship. */
function isStudentMessage(message: StoredMessage): boolean {
  return message.authorRole ? message.authorRole === "alumno" : message.from === "me";
}

/** Progress from the aggregated average, without loading every enrollment. */
function courseAverageProgress(
  course: StoredCourse,
  stats: EnrollmentMetrics["byCourse"][number] | undefined,
): number {
  const total = totalLessonsOf(course);
  if (!stats || total === 0) return 0;
  return Math.round((stats.averageCompletedLessons / total) * 100);
}

export async function getTeacherDashboard(user: StoredUser): Promise<TeacherDashboardDTO> {
  const repos = getRepositories();
  const allCourses = await repos.courses.list();
  const courses = allCourses.filter((course) => canManageCourse(course, user) && !isCourseExpired(course));
  const allEnrollments = await repos.enrollments.listByCourseIds(
    courses.map((course) => course.legacyId),
  );
  const byCourse = courseEnrollments(courses, allEnrollments);
  const courseIds = new Set(courses.map((course) => course.legacyId));

  const enrollments = [...byCourse.values()].flat();
  const students = new Set(enrollments.map((enrollment) => enrollment.studentEmail));

  const averageProgress = averageProgressFor(courses, enrollments);

  const conversations = await repos.conversations.listByTeacher(user.email);
  const studentMessages = conversations.filter((conversation) => {
    const last = conversation.messages.at(-1);
    return last ? isStudentMessage(last) : false;
  });
  const unreadMessages = studentMessages.length;

  const teacherCourses: TeacherCourseDTO[] = courses.map((course) => {
    const list = byCourse.get(course.legacyId) ?? [];
    return {
      id: course.legacyId,
      slug: course.slug,
      title: course.title,
      students: list.length,
      completion: avgProgress(course, list),
      img: course.img,
      status: course.status,
    };
  });

  const orders = await repos.orders.listVisibleForAdmin();
  const notifications: TeacherNotificationDTO[] = [];

  for (const order of orders.filter((item) => courseIds.has(item.courseId)).slice(0, 2)) {
    notifications.push({
      id: `ord_${order.id}`,
      icon: "enrollment",
      text: `Nuevo alumno inscripto: ${order.alumno} — ${order.curso}`,
      time: formatTime(order.createdAt),
    });
  }

  for (const conversation of studentMessages.slice(0, 2)) {
    notifications.push({
      id: `msg_${conversation.id}`,
      icon: "message",
      text: `Nuevo mensaje de ${conversation.studentName}`,
      time: formatTime(conversation.messages.at(-1)?.createdAt ?? new Date().toISOString()),
    });
  }

  return {
    activeStudents: students.size,
    averageProgress,
    newEnrollments: enrollments.filter((enrollment) => withinDays(enrollment.startedAt, 7)).length,
    unreadMessages,
    courses: teacherCourses,
    notifications: notifications.slice(0, 4),
  };
}

export async function getTeacherStudents(
  user: StoredUser,
  courseId: number,
): Promise<TeacherStudentDTO[]> {
  const repos = getRepositories();
  const course = await loadManagedCourse(courseId, user);

  const enrollments = await repos.enrollments.listByCourseIds([courseId]);
  const conversations = await repos.conversations.listByTeacher(user.email);
  const unreadByStudent = new Map(
    conversations
      .filter((conversation) => conversation.courseId === courseId)
      .map((conversation) => [
        conversation.studentEmail,
        conversation.messages.filter((message) => isStudentMessage(message)).length,
      ]),
  );

  return enrollments.map((enrollment) => {
    const progress = computeProgress(course, enrollment.completedLessonIds);
    const last = new Date(enrollment.startedAt).getTime();
    const days = Math.max(0, Math.round((Date.now() - last) / DAY));
    return {
      id: enrollment.id,
      name: enrollment.studentName,
      email: enrollment.studentEmail,
      progress,
      last:
        days === 0
          ? "Hoy"
          : days === 1
            ? "Ayer"
            : days < 7
              ? `Hace ${days} días`
              : days < 30
                ? `Hace ${Math.floor(days / 7)} semana(s)`
                : `Hace ${Math.floor(days / 30)} mes(es)`,
      msgs: unreadByStudent.get(enrollment.studentEmail) ?? 0,
    };
  });
}

/** Fills the last six calendar months, including months with no activity. */
function monthlySeries(entries: { month: string; value: number }[]): MonthlySeriesDTO[] {
  const now = new Date();
  const byMonth = new Map(entries.map((entry) => [entry.month, entry.value]));
  const buckets: MonthlySeriesDTO[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      month: MONTHS[date.getMonth()] ?? "",
      value: byMonth.get(monthKey(date)) ?? 0,
    });
  }

  return buckets;
}

function percentChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100% vs mes anterior" : "Sin variación";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs mes anterior`;
}

function buildReportes(
  courses: StoredCourse[],
  archives: StoredCourseArchive[],
  enrollmentMetrics: EnrollmentMetrics,
  orderMetrics: OrderMetrics,
): AdminReportesDTO {
  const byCourse = new Map(
    enrollmentMetrics.byCourse.map((entry) => [entry.courseId, entry]),
  );
  const courseRows = [
    ...courses.map((course) => ({
      name: course.title,
      pct: courseAverageProgress(course, byCourse.get(course.legacyId)),
      count: byCourse.get(course.legacyId)?.students ?? 0,
    })),
    ...archives.map((archive) => ({
      name: `${archive.title} (finalizado)`,
      pct: archive.lessonCount > 0
        ? Math.round(archive.averageCompletedLessons / archive.lessonCount * 100) : 0,
      count: archive.enrollmentCount,
    })),
  ];

  return {
    ingresosPorMes: monthlySeries(
      orderMetrics.paidMonthly.map((entry) => ({
        month: entry.month,
        value: Math.round(entry.cents / 100 / 1000),
      })),
    ),
    alumnosPorMes: monthlySeries(enrollmentMetrics.monthly),
    completionPorCurso: courseRows
      .map(({ name, pct }) => ({ name, pct }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4),
    cursosPopulares: courseRows
      .map(({ name, count }) => ({ name, count, color: "#B58A43" }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((item, index) => ({
        ...item,
        color: ["#B58A43", "#173B6C", "#72132C", "#5a8a9a"][index] ?? "#B58A43",
      })),
  };
}

/** Row counts that accompany a paginated overview, exposed as response headers. */
export type AdminOverviewTotals = {
  alumnos: number;
  profesores: number;
  cursos: number;
  orders: number;
  inscripciones: number;
};

function monthValue(read: (month: string) => number, date: Date): number {
  return read(monthKey(date));
}

export async function getAdminOverview(
  page?: Pagination,
): Promise<{ overview: AdminOverviewDTO; totals: AdminOverviewTotals }> {
  const repos = getRepositories();
  const [
    userCounts,
    courseCounts,
    enrollmentMetrics,
    orderMetrics,
    alumnoUsers,
    profesorUsers,
    courses,
    orders,
    enrollments,
    archives,
  ] = await Promise.all([
    repos.users.countByRole(),
    repos.courses.countByStatus(),
    repos.enrollments.metrics(),
    repos.orders.metrics(),
    repos.users.list("alumno", page),
    repos.users.list("profesor"),
    repos.courses.list(),
    repos.orders.listVisibleForAdmin(page),
    repos.enrollments.listVisibleForAdmin(page),
    repos.courseArchives.list(),
  ]);

  const monthlyHistory = new Map(enrollmentMetrics.monthly.map(({ month, value }) => [month, value]));
  for (const archive of archives) {
    for (const { day, count } of archive.startedByDay) {
      const month = day.slice(0, 7);
      monthlyHistory.set(month, (monthlyHistory.get(month) ?? 0) + count);
    }
  }
  const historicalEnrollments: EnrollmentMetrics = {
    ...enrollmentMetrics,
    total: enrollmentMetrics.total + archives.reduce((sum, archive) => sum + archive.enrollmentCount, 0),
    monthly: [...monthlyHistory].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value })),
  };

  const byCourse = new Map(
    enrollmentMetrics.byCourse.map((entry) => [entry.courseId, entry]),
  );
  const byId = courseIndex(courses);

  const ownEnrollments = await repos.enrollments.listByStudents(
    alumnoUsers.map((user) => user.email),
  );
  const ownByEmail = new Map<string, StoredEnrollment[]>();
  for (const enrollment of ownEnrollments) {
    const key = enrollment.studentEmail.toLowerCase();
    const list = ownByEmail.get(key) ?? [];
    list.push(enrollment);
    ownByEmail.set(key, list);
  }

  const alumnos = alumnoUsers.map((user) => {
    const own = ownByEmail.get(user.email.toLowerCase()) ?? [];
    return adminAlumno(
      user,
      own.length,
      averageProgressFor(courses, own),
      own[0] ? formatShortDate(own[0].startedAt) : "—",
    );
  });

  const profesores = profesorUsers.map((user) => {
    const ownCourses = courses.filter(
      (course) =>
        course.professorEmail?.toLowerCase() === user.email.toLowerCase() ||
        course.professor.toLowerCase().includes(user.name.toLowerCase()),
    );
    const students = ownCourses.reduce(
      (sum, course) => sum + (byCourse.get(course.legacyId)?.students ?? 0),
      0,
    );
    return adminProfesor(user, ownCourses.length, students);
  });

  const cursos = courses.map((course) =>
    adminCurso(
      course,
      byCourse.get(course.legacyId)?.students ?? 0,
      courseAverageProgress(course, byCourse.get(course.legacyId)),
    ),
  );

  const inscripciones: AdminInscripcionDTO[] = enrollments
    .map((enrollment): AdminInscripcionDTO | null => {
      const course = byId.get(enrollment.courseId);
      if (!course) return null;
      return {
        id: enrollment.id,
        alumno: enrollment.studentName,
        curso: course.title,
        fecha: formatShortDate(enrollment.startedAt),
        docente: course.professor.replace(/^(Abg\.|Dr\.|Dra\.)\s*/i, ""),
        estado: enrollment.status,
      };
    })
    .filter((value): value is AdminInscripcionDTO => Boolean(value));

  const now = new Date();
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const revenueByMonth = new Map(
    orderMetrics.paidMonthly.map((entry) => [entry.month, entry.cents]),
  );
  const enrollmentsByMonth = new Map(
    historicalEnrollments.monthly.map((entry) => [entry.month, entry.value]),
  );
  const revenueThis = monthValue((month) => revenueByMonth.get(month) ?? 0, now);
  const revenuePrev = monthValue((month) => revenueByMonth.get(month) ?? 0, previousMonthDate);
  const inscripcionesThis = monthValue(
    (month) => enrollmentsByMonth.get(month) ?? 0,
    now,
  );
  const inscripcionesPrev = monthValue(
    (month) => enrollmentsByMonth.get(month) ?? 0,
    previousMonthDate,
  );

  const reportes = buildReportes(courses, archives, historicalEnrollments, orderMetrics);
  const orderDTOs = orders.map(orderToDTO);

  const dashboard: AdminDashboardDTO = {
    totalIngresos: formatArs(orderMetrics.paidCents),
    alumnosActivos: enrollmentMetrics.activeStudents,
    cursosPublicados: courseCounts.published,
    cursosBorrador: courseCounts.draft,
    nuevasInscripciones: enrollmentMetrics.startedLast7Days,
    ingresosTrend: percentChange(revenueThis, revenuePrev),
    alumnosTrend: percentChange(inscripcionesThis, inscripcionesPrev),
    reportes,
    orders: orderDTOs,
    inscripciones,
  };

  return {
    overview: {
      dashboard,
      alumnos,
      profesores,
      cursos,
      orders: orderDTOs,
      inscripciones,
      reportes,
    },
    totals: {
      alumnos: userCounts.alumno,
      profesores: userCounts.profesor,
      cursos: courseCounts.published + courseCounts.draft,
      orders: orderMetrics.total,
      inscripciones: historicalEnrollments.total,
    },
  };
}

export async function listAdminEnrollments(
  page?: Pagination,
): Promise<{ items: ReturnType<typeof enrollmentToDTO>[]; total: number }> {
  const repos = getRepositories();
  const [courses, enrollments, total] = await Promise.all([
    repos.courses.list(),
    repos.enrollments.listVisibleForAdmin(page),
    repos.enrollments.countVisibleForAdmin(),
  ]);
  const byId = courseIndex(courses);
  const items = enrollments
    .map((enrollment) => {
      const course = byId.get(enrollment.courseId);
      return course ? enrollmentToDTO(enrollment, course) : null;
    })
    .filter((value): value is ReturnType<typeof enrollmentToDTO> => value !== null);
  return { items, total };
}

export async function listAdminOrders(
  page?: Pagination,
): Promise<{ items: ReturnType<typeof orderToDTO>[]; total: number }> {
  const repos = getRepositories();
  const [orders, total] = await Promise.all([
    repos.orders.listVisibleForAdmin(page),
    repos.orders.countVisibleForAdmin(),
  ]);
  return { items: orders.map(orderToDTO), total };
}
