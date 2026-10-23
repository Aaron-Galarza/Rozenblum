"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChatMessageDTO,
  ConversationDTO,
  CourseDTO,
  LessonBlockDTO,
  LessonType,
  ModuleDTO,
  TeacherDashboardDTO,
  TeacherStudentDTO,
} from "@rozenblum/shared";
import type { EditableModule, ProfesorCourse, ProfesorTab, SortDir } from "../../types";
import ClassroomHeader from "../../components/layout/ClassroomHeader";
import SimpleFooter from "../../components/layout/SimpleFooter";
import ProfesorDashboard from "./ProfesorDashboard";
import CourseEditor from "./CourseEditor";
import { apiFetch, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/use-session";
import { EmptyState, ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";

type Structure = { course: CourseDTO; modules: ModuleDTO[] };

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
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [expandedModules, setExpandedModules] = useState<number[]>([]);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [courseLoading, setCourseLoading] = useState(false);
  const [error, setError] = useState("");
  const [courseError, setCourseError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardData, conversationsData] = await Promise.all([
        apiFetch<TeacherDashboardDTO>("/api/teacher/dashboard", { auth: true }),
        apiFetch<ConversationDTO[]>("/api/teacher/conversations", { auth: true }),
      ]);
      setDashboard(dashboardData);
      setConversations(conversationsData);
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
    setSelectedCourseId(courseId);
    setTab("course");
    setCourseLoading(true);
    setCourseError("");
    try {
      const [structureData, studentData, conversationData] = await Promise.all([
        apiFetch<Structure>(`/api/teacher/courses/${courseId}`, { auth: true }),
        apiFetch<TeacherStudentDTO[]>(`/api/teacher/courses/${courseId}/students`, { auth: true }),
        apiFetch<ConversationDTO[]>("/api/teacher/conversations", { auth: true }),
      ]);
      setStructure(structureData);
      setStudents(studentData);
      setConversations(conversationData);
      setExpandedModules(structureData.modules.slice(0, 1).map((mod) => mod.id));
    } catch (err) {
      setCourseError(errorMessage(err));
    } finally {
      setCourseLoading(false);
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
    setStructure((prev) => (prev ? { ...prev, modules } : prev));

  const moduleApi = (path: string, method: string, body?: unknown) =>
    apiFetch<ModuleDTO[]>(`/api/teacher/courses/${selectedCourseId}${path}`, {
      method,
      auth: true,
      body,
    });

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
      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto" style={{ backgroundColor: "#FFFFFF", borderRight: "1px solid #E0E0E0" }}>
          <div className="p-5">
            <p className="text-[10px] font-bold tracking-widest uppercase mb-4" style={{ color: "#B58A43" }}>Mis Cursos</p>
            <div className="space-y-3">
              {teacherCourses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => void openCourse(course.id)}
                  className="w-full text-left p-3 rounded transition-colors hover:opacity-80"
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
            <button onClick={() => setTab("dashboard")} className="mt-6 w-full py-2.5 text-xs font-medium tracking-widest transition-all hover:brightness-110" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>
              VOLVER AL DASHBOARD
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 overflow-y-auto p-8">
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
              conversations={conversations}
              expandedModules={expandedModules}
              sortCol={sortCol}
              sortDir={sortDir}
              onToggleModule={toggleModule}
              onSort={handleSort}
              onTogglePublish={async () => {
                const nextStatus = structure.course.status === "published" ? "draft" : "published";
                const updated = await apiFetch<CourseDTO>(`/api/teacher/courses/${selectedCourseId}`, {
                  method: "PATCH",
                  auth: true,
                  body: { status: nextStatus },
                });
                setStructure((prev) => prev ? { ...prev, course: updated } : prev);
              }}
              onUpdateCourse={async (patch) => {
                const updated = await apiFetch<CourseDTO>(`/api/teacher/courses/${selectedCourseId}`, {
                  method: "PATCH", auth: true, body: patch,
                });
                setStructure((prev) => prev ? { ...prev, course: updated } : prev);
                await loadDashboard();
              }}
              onAddModule={async (title) => setModules(await moduleApi("/modules", "POST", { title }))}
              onRenameModule={async (id, title) => setModules(await moduleApi(`/modules/${id}`, "PATCH", { title }))}
              onDeleteModule={async (id) => setModules(await moduleApi(`/modules/${id}`, "DELETE"))}
              onMoveModule={async (id, dir) => {
                const ids = structure.modules.map((mod) => mod.id);
                const index = ids.indexOf(id);
                const swap = dir === "up" ? index - 1 : index + 1;
                if (swap < 0 || swap >= ids.length) return;
                [ids[index], ids[swap]] = [ids[swap], ids[index]];
                setModules(await moduleApi("/modules/reorder", "PUT", { ids }));
              }}
              onAddLesson={async (moduleId, payload) =>
                setModules(
                  await moduleApi(`/modules/${moduleId}/lessons`, "POST", payload),
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
                const index = ids.indexOf(lessonId);
                const swap = dir === "up" ? index - 1 : index + 1;
                if (swap < 0 || swap >= ids.length) return;
                [ids[index], ids[swap]] = [ids[swap], ids[index]];
                setModules(
                  await moduleApi(`/modules/${moduleId}/lessons/reorder`, "PUT", { ids }),
                );
              }}
              onSendMessage={async (conversationId, text): Promise<ChatMessageDTO[]> =>
                apiFetch<ChatMessageDTO[]>(`/api/teacher/conversations/${conversationId}/messages`, {
                  method: "POST",
                  auth: true,
                  body: { text },
                })
              }
            />
          ) : (
            <EmptyState
              title="Seleccioná un curso"
              message="Elegí uno de tus cursos en la barra lateral para editar su estructura y ver a los alumnos."
            />
          )}
        </main>

        {/* ── NOTIFICATIONS PANEL ── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto" style={{ backgroundColor: "#FFFFFF", borderLeft: "2px solid #B58A43" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
            <h4 className="text-lg font-semibold" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Notificaciones</h4>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(23,59,108,0.06)" }}>
            {(dashboard?.notifications ?? []).length === 0 && (
              <p className="px-5 py-4 text-xs" style={{ color: "rgba(23,59,108,0.5)" }}>Sin novedades por ahora.</p>
            )}
            {(dashboard?.notifications ?? []).map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-5 py-4 hover:opacity-80 transition-opacity cursor-pointer" style={{ backgroundColor: "transparent" }}>
                <span className="text-base flex-shrink-0 mt-0.5">{n.icon}</span>
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
