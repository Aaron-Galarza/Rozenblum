"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CourseDTO,
  ModuleDTO,
  TeacherDashboardDTO,
  TeacherStudentDTO,
} from "@rozenblum/shared";
import type { EditableModule, ProfesorCourse, ProfesorTab, SortDir } from "../../types";
import ClassroomHeader from "../../components/layout/ClassroomHeader";
import { IconBell, IconMail } from "../../components/icons";
import SimpleFooter from "../../components/layout/SimpleFooter";
import ProfesorDashboard from "./ProfesorDashboard";
import CourseEditor from "./CourseEditor";
import { apiFetch, apiFetchWithMeta, errorMessage, type ApiResponseMeta } from "../../lib/api";
import { useSession } from "../../lib/use-session";
import { EmptyState, ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";
import { moveIdInOrder } from "../../lib/editor-operations";

type Structure = { course: CourseDTO; modules: ModuleDTO[] };

function revisionFrom(meta: ApiResponseMeta, dto?: { revision?: number }): number | undefined {
  if (typeof dto?.revision === "number") return dto.revision;
  const raw = meta.headers.get("x-course-revision") ?? meta.headers.get("etag");
  const parsed = Number(String(raw ?? "").replace(/"/g, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function toEditableModules(modules: ModuleDTO[]): EditableModule[] {
  return modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    lessons: mod.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      content: lesson.content,
        document: lesson.document,
    })),
  }));
}

export default function ProfesorView() {
  const { session, ready } = useSession("profesor");
  const [tab, setTab] = useState<ProfesorTab>("dashboard");
  const [dashboard, setDashboard] = useState<TeacherDashboardDTO | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [students, setStudents] = useState<TeacherStudentDTO[]>([]);
  const [expandedModules, setExpandedModules] = useState<number[]>([]);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [courseLoading, setCourseLoading] = useState(false);
  const [error, setError] = useState("");
  const [courseError, setCourseError] = useState("");
  /** Latest known revision per course, used for each authoring mutation. */
  const revisionByCourseRef = useRef(new Map<number, number>());
  const activeCourseIdRef = useRef<number | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const dashboardData = await apiFetch<TeacherDashboardDTO>("/api/teacher/dashboard", { auth: true });
      setDashboard(dashboardData);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) void loadDashboard();
  }, [ready]);

  const openCourse = async (courseId: number) => {
    activeCourseIdRef.current = courseId;
    setSelectedCourseId(courseId);
    setTab("course");
    setCourseLoading(true);
    setCourseError("");
    try {
      const [structureData, studentData] = await Promise.all([
        apiFetch<Structure>(`/api/teacher/courses/${courseId}`, { auth: true }),
        apiFetch<TeacherStudentDTO[]>(`/api/teacher/courses/${courseId}/students`, { auth: true }),
      ]);
      if (activeCourseIdRef.current !== courseId) return;
      revisionByCourseRef.current.set(courseId, structureData.course.revision ?? 0);
      setStructure(structureData);
      setStudents(studentData);
      setExpandedModules(structureData.modules.slice(0, 1).map((mod) => mod.id));
    } catch (err) {
      if (activeCourseIdRef.current !== courseId) return;
      setCourseError(errorMessage(err));
    } finally {
      if (activeCourseIdRef.current === courseId) setCourseLoading(false);
    }
  };

  const toggleModule = (id: number) =>
    setExpandedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedStudents = useMemo(() => {
    const key = sortCol === "progress" || sortCol === "% progreso" ? "progress" : sortCol === "mensajes" ? "msgs" : sortCol === "email" ? "email" : "name";
    return [...students].sort((a, b) => {
      const av = a[key as keyof TeacherStudentDTO];
      const bv = b[key as keyof TeacherStudentDTO];
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [students, sortCol, sortDir]);

  const teacherCourses: ProfesorCourse[] = (dashboard?.courses ?? []).map((course) => ({
    id: course.id,
    title: course.title,
    students: course.students,
    completion: course.completion,
    img: course.img,
  }));

  const setModules = (modules: ModuleDTO[]) =>
    setStructure((prev) => (prev && prev.course.id === selectedCourseId ? { ...prev, modules } : prev));

  const moduleApi = async (
    path: string,
    method: string,
    body?: unknown,
    idempotencyKey?: string,
  ) => {
    if (selectedCourseId === null) throw new Error("Seleccioná un curso antes de editarlo.");
    const courseId = selectedCourseId;
    const { data, meta } = await apiFetchWithMeta<ModuleDTO[]>(
      `/api/teacher/courses/${courseId}${path}`,
      {
        method,
        auth: true,
        body,
        headers: {
          "if-match": String(revisionByCourseRef.current.get(courseId) ?? structure?.course.revision ?? 0),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
      },
    );
    const revision = revisionFrom(meta);
    if (revision !== undefined) revisionByCourseRef.current.set(courseId, revision);
    return data;
  };

  if (!ready) return <LoadingScreen label="Verificando sesión..." />;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      <ClassroomHeader
        breadcrumb={
          <>
            Mis Cursos <span style={{ color: "#B58A43" }}>›</span>{" "}
            <span style={{ color: "#173B6C" }}>{structure?.course.title ?? "Dashboard"}</span>
          </>
        }
        notificationCount={dashboard?.notifications.length ?? 0}
        userInitials={session?.user.initials ?? ""}
        userName={`Profesor: ${session?.user.name ?? ""}`}
      />

      {/* ── BODY ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ── SIDEBAR ── */}
        <aside className="w-full shrink-0 overflow-x-auto lg:w-72 lg:overflow-x-hidden lg:overflow-y-auto" style={{ backgroundColor: "#FFFFFF", borderRight: "1px solid #E0E0E0" }}>
          <nav aria-label="Cursos del profesor" className="flex w-max items-center gap-2 p-2 lg:block lg:w-auto lg:p-5">
            <p className="mb-4 hidden text-[10px] font-bold uppercase tracking-widest lg:block" style={{ color: "#B58A43" }}>Mis Cursos</p>
            <button onClick={() => setTab("dashboard")} className="order-first min-h-11 w-32 shrink-0 px-3 py-2.5 text-xs font-medium tracking-wide transition-all hover:brightness-110 lg:order-last lg:mt-6 lg:w-full" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>
              DASHBOARD
            </button>
            <div className="contents lg:block lg:space-y-3">
              {teacherCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => void openCourse(course.id)}
                  aria-current={tab === "course" && selectedCourseId === course.id ? "page" : undefined}
                  className="min-h-11 w-44 shrink-0 rounded p-3 text-left transition-colors hover:opacity-80 lg:w-full"
                  style={{
                    backgroundColor: tab === "course" && selectedCourseId === course.id ? "rgba(181,138,67,0.08)" : "transparent",
                    borderLeft: tab === "course" && selectedCourseId === course.id ? "4px solid #B58A43" : "4px solid transparent",
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{course.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(23,59,108,0.55)" }}>{course.students} alumnos · {course.completion}% completado</p>
                </button>
              ))}
            </div>
          </nav>
        </aside>

        {/* ── MAIN ── */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <details className="mb-4 rounded border border-[#e0e0e0] bg-white p-3 xl:hidden">
            <summary className="cursor-pointer text-sm font-medium text-[#173B6C]">Notificaciones ({dashboard?.notifications.length ?? 0})</summary>
            {(dashboard?.notifications ?? []).length === 0
              ? <p className="mt-3 text-xs text-[#64748b]">Sin novedades por ahora.</p>
              : (dashboard?.notifications ?? []).map((notification) => <p key={notification.id} className="mt-3 text-xs text-[#173B6C]">{notification.text}</p>)}
          </details>
          {loading ? (
            <LoadingScreen label="Cargando panel..." />
          ) : error ? (
            <ErrorPanel message={error} onRetry={() => void loadDashboard()} />
          ) : tab === "dashboard" ? (
            <ProfesorDashboard
              courses={teacherCourses}
              stats={{
                activeStudents: dashboard?.activeStudents ?? 0,
                averageProgress: dashboard?.averageProgress ?? 0,
                newEnrollments: dashboard?.newEnrollments ?? 0,
                unreadMessages: dashboard?.unreadMessages ?? 0,
              }}
              onOpenCourse={(courseId) => void openCourse(courseId)}
            />
          ) : courseLoading ? (
            <LoadingScreen label="Cargando curso..." />
          ) : courseError ? (
            <ErrorPanel message={courseError} onRetry={() => selectedCourseId && void openCourse(selectedCourseId)} />
          ) : structure && selectedCourseId ? (
            <CourseEditor
              courseId={selectedCourseId}
              courseTitle={structure.course.title}
              courseDescription={structure.course.description}
              courseImage={structure.course.img}
              published={structure.course.status === "published"}
              modules={toEditableModules(structure.modules)}
              students={sortedStudents}
              expandedModules={expandedModules}
              sortCol={sortCol}
              sortDir={sortDir}
              onToggleModule={toggleModule}
              onSort={handleSort}
              onTogglePublish={async () => {
                const courseId = selectedCourseId;
                if (courseId === null) throw new Error("Seleccioná un curso antes de editarlo.");
                const nextStatus = structure.course.status === "published" ? "draft" : "published";
                const { data: updated, meta } = await apiFetchWithMeta<CourseDTO>(
                  `/api/teacher/courses/${courseId}`,
                  {
                    method: "PATCH",
                    auth: true,
                    body: { status: nextStatus },
                    headers: { "if-match": String(revisionByCourseRef.current.get(courseId) ?? structure.course.revision ?? 0) },
                  },
                );
                const revision = revisionFrom(meta, updated);
                if (revision !== undefined) revisionByCourseRef.current.set(courseId, revision);
                setStructure((prev) => prev?.course.id === courseId ? { ...prev, course: updated } : prev);
              }}
              onUpdateCourse={async (patch) => {
                const courseId = selectedCourseId;
                if (courseId === null) throw new Error("Seleccioná un curso antes de editarlo.");
                const { data: updated, meta } = await apiFetchWithMeta<CourseDTO>(
                  `/api/teacher/courses/${courseId}`,
                  {
                    method: "PATCH",
                    auth: true,
                    body: patch,
                    headers: { "if-match": String(revisionByCourseRef.current.get(courseId) ?? structure.course.revision ?? 0) },
                  },
                );
                const revision = revisionFrom(meta, updated);
                if (revision !== undefined) revisionByCourseRef.current.set(courseId, revision);
                setStructure((prev) => prev?.course.id === courseId ? { ...prev, course: updated } : prev);
                await loadDashboard();
              }}
              onAddModule={async (title, idempotencyKey) =>
                setModules(await moduleApi("/modules", "POST", { title }, idempotencyKey))
              }
              onRenameModule={async (id, title) => setModules(await moduleApi(`/modules/${id}`, "PATCH", { title }))}
              onDeleteModule={async (id) => setModules(await moduleApi(`/modules/${id}`, "DELETE"))}
              onMoveModule={async (id, dir) => {
                const ids = structure.modules.map((mod) => mod.id);
                const orderedIds = moveIdInOrder(ids, id, dir);
                if (!orderedIds) return;
                setModules(await moduleApi("/modules/reorder", "PUT", { ids: orderedIds }));
              }}
              onAddLesson={async (moduleId, payload, idempotencyKey) =>
                setModules(
                  await moduleApi(
                    `/modules/${moduleId}/lessons`,
                    "POST",
                    payload,
                    idempotencyKey,
                  ),
                )
              }
              onUpdateLesson={async (moduleId, lessonId, payload) =>
                setModules(
                  await moduleApi(`/modules/${moduleId}/lessons/${encodeURIComponent(lessonId)}`, "PATCH", payload),
                )
              }
              onDeleteLesson={async (moduleId, lessonId) =>
                setModules(
                  await moduleApi(`/modules/${moduleId}/lessons/${encodeURIComponent(lessonId)}`, "DELETE"),
                )
              }
              onMoveLesson={async (moduleId, lessonId, dir) => {
                const mod = structure.modules.find((item) => item.id === moduleId);
                if (!mod) return;
                const ids = mod.lessons.map((lesson) => lesson.id);
                const orderedIds = moveIdInOrder(ids, lessonId, dir);
                if (!orderedIds) return;
                setModules(
                  await moduleApi(`/modules/${moduleId}/lessons/reorder`, "PUT", { ids: orderedIds }),
                );
              }}
            />
          ) : (
            <EmptyState
              title="Seleccioná un curso"
              message="Elegí uno de tus cursos en la barra lateral para editar su estructura y ver a los alumnos."
            />
          )}
        </main>

        {/* ── NOTIFICATIONS PANEL ── */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto xl:block" style={{ backgroundColor: "#FFFFFF", borderLeft: "2px solid #B58A43" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
            <h4 className="text-lg font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Notificaciones</h4>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(23,59,108,0.06)" }}>
            {(dashboard?.notifications ?? []).length === 0 && (
              <p className="px-5 py-4 text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>Sin novedades por ahora.</p>
            )}
            {(dashboard?.notifications ?? []).map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-5 py-4 hover:opacity-80 transition-opacity cursor-pointer" style={{ backgroundColor: "transparent" }}>
                <span className="mt-0.5 shrink-0 text-[#B58A43]" aria-hidden="true">{n.icon === "message" ? <IconMail className="h-4 w-4" /> : <IconBell className="h-4 w-4" />}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed" style={{ color: "#173B6C" }}>{n.text}</p>
                  <p className="text-[10px] mt-1" style={{ color: "rgba(23,59,108,0.45)" }}>{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <SimpleFooter />
    </div>
  );
}
