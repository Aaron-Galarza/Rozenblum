"use client";

import { useEffect, useMemo, useState } from "react";
import type { EnrollmentDTO } from "@rozenblum/shared";
import type { CourseModuleView, Lesson } from "../../types";
import ClassroomHeader from "../../components/layout/ClassroomHeader";
import SimpleFooter from "../../components/layout/SimpleFooter";
import ModuleSidebar from "./ModuleSidebar";
import LessonViewer from "./LessonViewer";
import ChatSidebar from "./ChatSidebar";
import { apiFetch, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/use-session";
import { EmptyState, ErrorPanel, LoadingScreen } from "../../components/ui/AsyncState";
import Toast from "../../components/ui/Toast";
import { useToast } from "../../lib/use-toast";
import { useLiveChat } from "../../lib/use-live-chat";
import { IconGraduation } from "../../components/icons";

export default function AlumnoView() {
  const { session, ready } = useSession("alumno");
  const [enrollments, setEnrollments] = useState<EnrollmentDTO[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [expandedModules, setExpandedModules] = useState<number[]>([]);
  const [chatMsg, setChatMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast(2600);

  const enrollment = useMemo(
    () => enrollments.find((item) => item.id === selectedEnrollmentId) ?? null,
    [enrollments, selectedEnrollmentId],
  );
  const chatPath = enrollment && enrollment.status !== "Pendiente" && enrollment.status !== "Revocado"
    ? `/api/student/enrollments/${encodeURIComponent(enrollment.id)}/messages`
    : null;
  const { messages, loading: chatLoading, sending: chatSending, error: chatError, connectionState: chatConnectionState,
    sendMessage: postChatMessage, retry: retryChat } = useLiveChat(chatPath);

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
          document: lesson.document,
        })),
      })),
    [enrollment],
  );

  const availableLessons: Lesson[] = modules
    .filter((mod) => mod.status !== "locked")
    .flatMap((mod) => mod.lessons);

  const selectedLesson = availableLessons.find((lesson) => lesson.id === selectedLessonId) ?? availableLessons[0] ?? null;

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
    if (!enrollment) return;
    const firstAvailable = enrollment.modules
      .filter((mod) => mod.status !== "locked")
      .flatMap((mod) => mod.lessons)[0];
    setSelectedLessonId((current) =>
      enrollment.modules.some((mod) => mod.status !== "locked" && mod.lessons.some((lesson) => lesson.id === current))
        ? current
        : firstAvailable?.id ?? "",
    );

  }, [enrollment]);

  const toggleModule = (id: number) =>
    setExpandedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const selectLesson = (lesson: Lesson) => setSelectedLessonId(lesson.id);

  const currentIdx = selectedLesson
    ? availableLessons.findIndex((lesson) => lesson.id === selectedLesson.id)
    : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < availableLessons.length - 1;

  const goNext = () => { if (hasNext) setSelectedLessonId(availableLessons[currentIdx + 1].id); };
  const goPrev = () => { if (hasPrev) setSelectedLessonId(availableLessons[currentIdx - 1].id); };

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
          ? "Curso completado"
          : `✓ Lección completada · ${updated.progress}% del curso`,
      );
    } catch (err) {
      showToast(errorMessage(err), true);
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!enrollment || !chatMsg.trim() || chatSending) return;
    const text = chatMsg.trim();
    try {
      if (await postChatMessage(text)) setChatMsg((current) => current.trim() === text ? "" : current);
    } catch (err) {
      showToast(errorMessage(err), true);
    }
  };

  if (!ready) return <LoadingScreen label="Verificando sesión..." />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}>
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
      />

      {loading ? (
        <LoadingScreen label="Cargando tu aula..." />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : enrollment?.status === "Pendiente" || enrollment?.status === "Revocado" ? (
        <EmptyState
          title={enrollment.status === "Revocado" ? "Tu acceso está revocado" : "Tu inscripción está pendiente"}
          message={enrollment.status === "Revocado"
            ? "Contactanos si necesitás revisar el estado de tu pago o inscripción."
            : "Cuando se valide el pago, vas a poder acceder a las lecciones y conversar con el profesor."}
        />
      ) : !enrollment || !selectedLesson ? (
        <EmptyState
          title="Todavía no tenés cursos activos"
          message="Cuando Mercado Pago confirme tu inscripción, tus cursos van a aparecer acá. Podés consultar el estado de tu orden en la pantalla de confirmación."
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
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
            />

            <ChatSidebar
              conversationKey={chatPath}
              messages={messages}
              loading={chatLoading}
              sending={chatSending}
              error={chatError}
              connectionState={chatConnectionState}
              onRetry={retryChat}
              chatMsg={chatMsg}
              onChatMsgChange={setChatMsg}
              onSend={() => void sendMessage()}
            />
          </div>

          {enrollment.progress >= 100 && (
            <p className="flex items-center justify-center gap-2 px-6 py-2 text-xs text-center" style={{ color: "#173B6C", backgroundColor: "#F5EBD8" }}>
              <IconGraduation className="h-4 w-4 shrink-0" />
              Curso completado. La emisión de certificados estará disponible próximamente.
            </p>
          )}
        </>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}

      <SimpleFooter />
    </div>
  );
}
