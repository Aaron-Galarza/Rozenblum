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
import { formatArs } from "../lib/utils.js";
import { env } from "../config/env.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredCourse, StoredEnrollment, StoredOrder, StoredUser } from "../types.js";
import {
  adminAlumno,
  adminCurso,
  adminProfesor,
  computeProgress,
  enrollmentToDTO,
  orderToDTO,
  settingsToDTO,
} from "./mappers.js";
import { canManageCourse } from "./courses.js";

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const withinDays = (iso: string, days: number) =>
  Date.now() - new Date(iso).getTime() <= days * DAY;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );

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

export async function getTeacherDashboard(user: StoredUser): Promise<TeacherDashboardDTO> {
  const repos = getRepositories();
  const allCourses = await repos.courses.list();
  const courses = allCourses.filter((course) => canManageCourse(course, user));
  const allEnrollments = await repos.enrollments.listAll();
  const byCourse = courseEnrollments(courses, allEnrollments);
  const courseIds = new Set(courses.map((course) => course.legacyId));

  const enrollments = [...byCourse.values()].flat();
  const students = new Set(enrollments.map((enrollment) => enrollment.studentEmail));

  const averageProgress =
    enrollments.length === 0
      ? 0
      : Math.round(
          enrollments.reduce((total, enrollment) => {
            const course = courses.find((item) => item.legacyId === enrollment.courseId);
            return total + (course ? computeProgress(course, enrollment.completedLessonIds) : 0);
          }, 0) / enrollments.length,
        );

  const conversations = await repos.conversations.listByTeacher(user.email);
  const unreadMessages = conversations.filter(
    (conversation) => conversation.messages.at(-1)?.from === "me",
  ).length;

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

  const orders = await repos.orders.list();
  const notifications: TeacherNotificationDTO[] = [];

  for (const order of orders.filter((item) => courseIds.has(item.courseId)).slice(0, 2)) {
    notifications.push({
      id: `ord_${order.id}`,
      icon: "🔔",
      text: `Nuevo alumno inscripto: ${order.alumno} — ${order.curso}`,
      time: formatTime(order.createdAt),
    });
  }

  for (const conversation of conversations
    .filter((item) => item.messages.at(-1)?.from === "me")
    .slice(0, 2)) {
    notifications.push({
      id: `msg_${conversation.id}`,
      icon: "✉️",
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
  const course = await repos.courses.findById(courseId);
  if (!course) throw new Error("Curso no encontrado.");
  if (!canManageCourse(course, user)) throw new Error("No gestionás este curso.");

  const enrollments = (await repos.enrollments.listAll()).filter(
    (enrollment) => enrollment.courseId === courseId,
  );
  const conversations = await repos.conversations.listByTeacher(user.email);
  const unreadByStudent = new Map(
    conversations
      .filter((conversation) => conversation.courseId === courseId)
      .map((conversation) => [
        conversation.studentEmail,
        conversation.messages.filter((message) => message.from === "me").length,
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

function monthlySeries(
  dates: { iso: string; value: number }[],
): MonthlySeriesDTO[] {
  const now = new Date();
  const buckets: MonthlySeriesDTO[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = MONTHS[date.getMonth()] ?? "";
    const total = dates
      .filter((item) => {
        const value = new Date(item.iso);
        return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth();
      })
      .reduce((sum, item) => sum + item.value, 0);
    buckets.push({ month, value: total });
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
  enrollments: StoredEnrollment[],
  orders: StoredOrder[],
): AdminReportesDTO {
  const paid = orders.filter((order) => order.estado === "Pagado");
  const byCourse = courseEnrollments(courses, enrollments);

  return {
    ingresosPorMes: monthlySeries(
      paid.map((order) => ({ iso: order.createdAt, value: Math.round(order.montoCents / 100 / 1000) })),
    ),
    alumnosPorMes: monthlySeries(
      enrollments.map((enrollment) => ({ iso: enrollment.startedAt, value: 1 })),
    ),
    completionPorCurso: courses
      .map((course) => ({
        name: course.title,
        pct: avgProgress(course, byCourse.get(course.legacyId) ?? []),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4),
    cursosPopulares: courses
      .map((course) => ({
        name: course.title,
        count: (byCourse.get(course.legacyId) ?? []).length,
        color: "#B58A43",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((item, index) => ({
        ...item,
        color: ["#B58A43", "#173B6C", "#72132C", "#5a8a9a"][index] ?? "#B58A43",
      })),
  };
}

export async function getAdminOverview(): Promise<AdminOverviewDTO> {
  const repos = getRepositories();
  const [users, courses, enrollments, orders, settings] = await Promise.all([
    repos.users.list(),
    repos.courses.list(),
    repos.enrollments.listAll(),
    repos.orders.list(),
    repos.settings.get(),
  ]);

  const alumnosUsers = users.filter((user) => user.role === "alumno");
  const profesorUsers = users.filter((user) => user.role === "profesor");
  const byCourse = courseEnrollments(courses, enrollments);

  const alumnos = alumnosUsers.map((user) => {
    const own = enrollments.filter(
      (enrollment) => enrollment.studentEmail.toLowerCase() === user.email.toLowerCase(),
    );
    const progress =
      own.length === 0
        ? 0
        : Math.round(
            own.reduce((sum, enrollment) => {
              const course = courses.find((item) => item.legacyId === enrollment.courseId);
              return sum + (course ? computeProgress(course, enrollment.completedLessonIds) : 0);
            }, 0) / own.length,
          );
    const fecha = own[0]
      ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" }).format(
          new Date(own[0].startedAt),
        )
      : "—";
    return adminAlumno(user, own.length, progress, fecha);
  });

  const profesores = profesorUsers.map((user) => {
    const ownCourses = courses.filter(
      (course) =>
        course.professorEmail?.toLowerCase() === user.email.toLowerCase() ||
        course.professor.toLowerCase().includes(user.name.toLowerCase()),
    );
    const students = new Set(
      ownCourses.flatMap((course) =>
        (byCourse.get(course.legacyId) ?? []).map((enrollment) => enrollment.studentEmail),
      ),
    );
    return adminProfesor(user, ownCourses.length, students.size);
  });

  const cursos = courses.map((course) =>
    adminCurso(
      course,
      (byCourse.get(course.legacyId) ?? []).length,
      avgProgress(course, byCourse.get(course.legacyId) ?? []),
    ),
  );

  const inscripciones: AdminInscripcionDTO[] = enrollments
    .map((enrollment): AdminInscripcionDTO | null => {
      const course = courses.find((item) => item.legacyId === enrollment.courseId);
      if (!course) return null;
      const date = new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(enrollment.startedAt));
      return {
        id: enrollment.id,
        alumno: enrollment.studentName,
        curso: course.title,
        fecha: date,
        docente: course.professor.replace(/^(Abg\.|Dr\.|Dra\.)\s*/i, ""),
        estado: enrollment.status,
      };
    })
    .filter((value): value is AdminInscripcionDTO => Boolean(value));

  const paid = orders.filter((order) => order.estado === "Pagado");
  const now = new Date();
  const thisMonth = paid.filter((order) => {
    const date = new Date(order.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const previousMonth = paid.filter((order) => {
    const date = new Date(order.createdAt);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return date.getMonth() === previous.getMonth() && date.getFullYear() === previous.getFullYear();
  });

  const revenueThis = thisMonth.reduce((sum, order) => sum + order.montoCents, 0);
  const revenuePrev = previousMonth.reduce((sum, order) => sum + order.montoCents, 0);

  const inscripcionesThis = enrollments.filter((enrollment) => {
    const date = new Date(enrollment.startedAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const inscripcionesPrev = enrollments.filter((enrollment) => {
    const date = new Date(enrollment.startedAt);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return date.getMonth() === previous.getMonth() && date.getFullYear() === previous.getFullYear();
  });

  const reportes = buildReportes(courses, enrollments, orders);

  const dashboard: AdminDashboardDTO = {
    totalIngresos: formatArs(paid.reduce((sum, order) => sum + order.montoCents, 0)),
    alumnosActivos: new Set(
      enrollments
        .filter((enrollment) => enrollment.status === "Activo")
        .map((enrollment) => enrollment.studentEmail),
    ).size,
    cursosPublicados: courses.filter((course) => course.status === "published").length,
    cursosBorrador: courses.filter((course) => course.status === "draft").length,
    nuevasInscripciones: enrollments.filter((enrollment) => withinDays(enrollment.startedAt, 7))
      .length,
    ingresosTrend: percentChange(revenueThis, revenuePrev),
    alumnosTrend: percentChange(inscripcionesThis.length, inscripcionesPrev.length),
    reportes,
    orders: orders.map(orderToDTO),
    inscripciones,
  };

  return {
    dashboard,
    alumnos,
    profesores,
    cursos,
    orders: orders.map(orderToDTO),
    inscripciones,
    reportes,
    settings: settingsToDTO(settings, env.paymentsConfigured),
  };
}

export async function listAdminEnrollments() {
  const repos = getRepositories();
  const courses = await repos.courses.list();
  const byId = new Map(courses.map((course) => [course.legacyId, course]));
  return (await repos.enrollments.listAll())
    .map((enrollment) => {
      const course = byId.get(enrollment.courseId);
      return course ? enrollmentToDTO(enrollment, course) : null;
    })
    .filter((value) => value !== null);
}
