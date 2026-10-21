"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatMessageDTO, EnrollmentDTO } from "@rozenblum/shared";
import type { ChatMessage, CourseModuleView, Lesson } from "../../types";
import ClassroomHeader from "../../components/layout/ClassroomHeader";
import SimpleFooter from "../../components/layout/SimpleFooter";
import ModuleSidebar from "./ModuleSidebar";
import LessonViewer from "./LessonViewer";
import ChatSidebar from "./ChatSidebar";
import { apiFetch, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/use-session";
import { EmptyState, ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";
import Toast from "../../components/ui/Toast";

export default function AlumnoView() {
  const { session, ready } = useSession("alumno");
  const [enrollments, setEnrollments] = useState<EnrollmentDTO[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [expandedModules, setExpandedModules] = useState<number[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMsg, setChatMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  const enrollment = useMemo(
    () => enrollments.find((item) => item.id === selectedEnrollmentId) ?? null,
    [enrollments, selectedEnrollmentId],
  );

  const modules: CourseModuleView[] = useMemo(
    () =>
      (enrollment?.modules ?? []).map((mod) => ({
        id: mod.id,
        title: mod.title,
        status: mod.status,
        lessons: mod.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          done: lesson.done,
          highlight: lesson.highlight,
          content: lesson.content,
        })),
      })),
    [enrollment],
  );

  const availableLessons: Lesson[] = modules
    .filter((mod) => mod.status !== "locked")
    .flatMap((mod) => mod.lessons);

  const allLessons: Lesson[] = modules.flatMap((mod) => mod.lessons);
  const selectedLesson = allLessons.find((lesson) => lesson.id === selectedLessonId) ?? availableLessons[0] ?? null;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<EnrollmentDTO[]>("/api/student/enrollments", { auth: true });
      setEnrollments(data);
      const first = data[0];
      if (first) {
        setSelectedEnrollmentId((current) => current || first.id);
        setExpandedModules((current) => current.length ? current : first.modules.filter((m) => m.status !== "locked").slice(0, 2).map((m) => m.id));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  useEffect(() => {
    if (!enrollment) {
      setMessages([]);
      return;
    }
    const firstAvailable = enrollment.modules
      .filter((mod) => mod.status !== "locked")
      .flatMap((mod) => mod.lessons)[0];
    setSelectedLessonId((current) =>
      enrollment.modules.some((mod) => mod.lessons.some((lesson) => lesson.id === current))
        ? current
        : firstAvailable?.id ?? "",
    );

    apiFetch<ChatMessageDTO[]>(`/api/student/enrollments/${enrollment.id}/messages`, { auth: true })
      .then((data) =>
        setMessages(data.map((message) => ({ ...message, from: message.from }))),
      )
      .catch(() => setMessages([]));
  }, [enrollment?.id]);

  const toggleModule = (id: number) =>
    setExpandedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const selectLesson = (lesson: Lesson) => setSelectedLessonId(lesson.id);

  const currentIdx = selectedLesson
    ? allLessons.findIndex((lesson) => lesson.id === selectedLesson.id)
    : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < allLessons.length - 1;

  const goNext = () => { if (hasNext) setSelectedLessonId(allLessons[currentIdx + 1].id); };
  const goPrev = () => { if (hasPrev) setSelectedLessonId(allLessons[currentIdx - 1].id); };

  const handleComplete = async () => {
    if (!enrollment || !selectedLesson || saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<EnrollmentDTO>(
        `/api/student/enrollments/${enrollment.id}/progress`,
        {
          method: "PATCH",
          auth: true,
          body: { lessonId: selectedLesson.id, completed: true },
        },
      );
      setEnrollments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      const moduleId = updated.modules.find((mod) =>
        mod.lessons.some((lesson) => lesson.id === selectedLesson.id),
      )?.id;
      if (moduleId !== undefined) {
        setExpandedModules((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
      }
      showToast(
        updated.progress >= 100
          ? "🎓 Curso completado — certificado disponible"
          : `✓ Lección completada · ${updated.progress}% del curso`,
      );
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!enrollment || !chatMsg.trim() || chatSending) return;
    const text = chatMsg.trim();
    setChatSending(true);
    try {
      const updated = await apiFetch<ChatMessageDTO[]>(
        `/api/student/enrollments/${enrollment.id}/messages`,
        { method: "POST", auth: true, body: { text } },
      );
      setMessages(updated.map((message) => ({ ...message, from: message.from })));
      setChatMsg("");
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setChatSending(false);
    }
  };

  if (!ready) return <LoadingScreen label="Verificando sesión..." />;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
      <ClassroomHeader
        breadcrumb={
          enrollment && selectedLesson ? (
            <>
              Mis Cursos <span style={{ color: "#B58A43" }}>›</span> {enrollment.courseTitle} <span style={{ color: "#B58A43" }}>›</span> <span style={{ color: "#173B6C" }}>Lección {selectedLesson.id}</span>
            </>
          ) : (
            <>Mis Cursos</>
          )
        }
        notificationCount={messages.filter((m) => m.from === "prof").length}
        userInitials={session?.user.initials ?? ""}
        userName={`Alumno: ${session?.user.name ?? ""}`}
        userMenuItems={["Mi Perfil", "Mis Cursos", "Certificados"]}
      />

      {loading ? (
        <LoadingScreen label="Cargando tu aula..." />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : !enrollment || !selectedLesson ? (
        <EmptyState
          title="Todavía no tenés cursos activos"
          message="Cuando se valide tu inscripción, tus cursos van a aparecer acá. Si ya pagaste, escribinos por WhatsApp desde la pantalla de confirmación."
        />
      ) : (
        <>
          <div className="flex flex-1 overflow-hidden">
            <ModuleSidebar
              modules={modules}
              expandedModules={expandedModules}
              selectedLesson={selectedLesson}
              onToggleModule={toggleModule}
              onSelectLesson={selectLesson}
              courseTitle={enrollment.courseTitle}
              courseImg={enrollment.courseImg}
              progress={enrollment.progress}
              statusLabel={enrollment.status === "Completado" ? "COMPLETADO" : "EN CURSO"}
              courses={enrollments.map((item) => ({ id: item.courseId, title: item.courseTitle }))}
              onSelectCourse={(courseId) => {
                const next = enrollments.find((item) => item.courseId === courseId);
                if (next) {
                  setSelectedEnrollmentId(next.id);
                  setSelectedLessonId("");
                }
              }}
            />

            <LessonViewer
              selectedLesson={selectedLesson}
              courseTitle={enrollment.courseTitle}
              professor={enrollment.courseProfessor}
              progress={enrollment.progress}
              completed={selectedLesson.done}
              saving={saving}
              onToggleCompleted={() => void handleComplete()}
              onPrevLesson={goPrev}
              onNextLesson={goNext}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onDownload={() => showToast("Esta lección todavía no tiene un archivo adjunto.")}
            />

            <ChatSidebar
              messages={messages}
              chatMsg={chatMsg}
              onChatMsgChange={setChatMsg}
              onSend={() => void sendMessage()}
            />
          </div>

          {enrollment.progress >= 100 && (
            <button
              onClick={() => showToast("🎓 Certificado en preparación — te lo enviamos por email")}
              className="fixed bottom-6 right-6 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 z-50"
              style={{ backgroundColor: "#B58A43", color: "#173B6C" }}
              title="Descargar Certificado"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
        </>
      )}

      {toast && <Toast message={toast} />}

      <SimpleFooter />
    </div>
  );
}
