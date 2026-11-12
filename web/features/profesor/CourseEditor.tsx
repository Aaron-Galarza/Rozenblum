"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LessonBlockDTO, LessonType, RichLessonDocument } from "@rozenblum/shared";
import type { EditableModule, EditableLesson, ProfesorStudent, SortDir } from "../../types";
const LessonEditorModal = dynamic(() => import("./RichLessonEditorModal"), { ssr: false });
import Modal from "../../components/ui/Modal";
import Toast from "../../components/ui/Toast";
import { useToast } from "../../lib/use-toast";
import { useLiveChat } from "../../lib/use-live-chat";
import { useChatScroll } from "../../lib/use-chat-scroll";
import { canRetryEditorOperation, editorErrorMessage, newIdempotencyKey } from "../../lib/editor-operations";

type LessonPayload = { title: string; type: LessonType; content: LessonBlockDTO[]; document: RichLessonDocument };

type CourseEditorProps = {
  courseId: number;
  courseTitle: string;
  courseDescription: string;
  courseImage: string;
  published: boolean;
  modules: EditableModule[];
  students: ProfesorStudent[];
  expandedModules: number[];
  sortCol: string;
  sortDir: SortDir;
  onToggleModule: (id: number) => void;
  onSort: (col: string) => void;
  onTogglePublish: () => Promise<void>;
  onUpdateCourse: (patch: { title: string; description: string; img?: string }) => Promise<void>;
  onAddModule: (title: string, idempotencyKey: string) => Promise<void>;
  onRenameModule: (id: number, title: string) => Promise<void>;
  onDeleteModule: (id: number) => Promise<void>;
  onMoveModule: (id: number, dir: "up" | "down") => Promise<void>;
  onAddLesson: (moduleId: number, payload: LessonPayload, idempotencyKey: string) => Promise<void>;
  onUpdateLesson: (moduleId: number, lessonId: string, payload: LessonPayload) => Promise<void>;
  onDeleteLesson: (moduleId: number, lessonId: string) => Promise<void>;
  onMoveLesson: (moduleId: number, lessonId: string, dir: "up" | "down") => Promise<void>;
};

type StudentModal = { type: "ver" | "chat"; student: ProfesorStudent } | null;
type OperationFeedback = { type: "saving" | "success" | "error"; message: string; retry?: () => void; retryLabel?: string };


export default function CourseEditor({
  courseId,
  courseTitle,
  courseDescription,
  courseImage,
  published,
  modules,
  students,
  expandedModules,
  sortCol,
  sortDir,
  onToggleModule,
  onSort,
  onTogglePublish,
  onUpdateCourse,
  onAddModule,
  onRenameModule,
  onDeleteModule,
  onMoveModule,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onMoveLesson,
}: CourseEditorProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"new" | "edit">("new");
  const [editing, setEditing] = useState<{
    moduleId: number;
    moduleName: string;
    lesson?: EditableLesson;
  } | null>(null);
  const [studentModal, setStudentModal] = useState<StudentModal>(null);
  const [chatInput, setChatInput] = useState("");
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [courseEditOpen, setCourseEditOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: courseTitle, description: courseDescription });
  const { toast, showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [creationBlocked, setCreationBlocked] = useState(false);
  const [operationFeedback, setOperationFeedback] = useState<OperationFeedback | null>(null);
  const chatPath = studentModal?.type === "chat"
    ? `/api/teacher/courses/${courseId}/students/${encodeURIComponent(studentModal.student.id)}/messages`
    : null;
  const { messages: chatMessages, loading: chatLoading, sending: chatSending,
    error: chatError, sendMessage: postChatMessage, retry: retryChat } = useLiveChat(chatPath);
  const chatScroll = useChatScroll<HTMLDivElement>(chatMessages, chatPath);

  const run = async (
    action: () => Promise<void>,
    message: string,
    options: { pending?: string; retryable?: boolean; creation?: boolean; verifyBeforeRetry?: boolean } = {},
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setOperationFeedback({ type: "saving", message: options.pending ?? "Guardando cambios…" });
    try {
      await action();
      if (options.creation) setCreationBlocked(false);
      setOperationFeedback({ type: "success", message });
      showToast(message);
    } catch (error) {
      const failureMessage = editorErrorMessage(error, { creationMayHaveSucceeded: options.creation, verifyBeforeRetry: options.verifyBeforeRetry });
      const uncertainCreate = Boolean(options.creation && canRetryEditorOperation(error));
      if (uncertainCreate) setCreationBlocked(true);
      const retry = options.retryable && canRetryEditorOperation(error)
        ? () => {
            if (options.creation && !window.confirm("No se pudo confirmar si la operación llegó al servidor. Revisá el curso en otra pestaña y confirmá que no se creó antes de reintentar.")) return;
            if (options.creation) setCreationBlocked(false);
            void run(action, message, { ...options, retryable: options.creation });
          }
        : undefined;
      setOperationFeedback({ type: "error", message: failureMessage, retry, ...(uncertainCreate ? { retryLabel: "Verifiqué que no se creó; reintentar" } : {}) });
      showToast(failureMessage, true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleEditorSave = async (payload: LessonPayload, idempotencyKey?: string) => {
    if (!editing) return;
    if (editorMode === "new") {
      if (!idempotencyKey) throw new Error("No se pudo generar la clave de creación. Volvé a intentar.");
      await onAddLesson(editing.moduleId, payload, idempotencyKey);
      showToast("✓ Lección creada");
    } else if (editing.lesson?.id) {
      await onUpdateLesson(editing.moduleId, editing.lesson.id, payload);
      showToast("✓ Lección guardada");
    }
    setEditorOpen(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !studentModal || chatSending) return;
    const text = chatInput.trim();
    try {
      if (await postChatMessage(text)) setChatInput((current) => current.trim() === text ? "" : current);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo enviar el mensaje.", true);
    }
  };

  const averageProgress = students.length
    ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / students.length)
    : 0;

  return (
    <>
      {/* Course header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h2 className="text-2xl font-light sm:text-3xl" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{courseTitle}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => { setCourseForm({ title: courseTitle, description: courseDescription }); setCourseEditOpen(true); }}
            className="min-h-11 px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-70 disabled:opacity-50"
            style={{ color: "#173B6C", borderColor: "#173B6C" }}
          >
            EDITAR
          </button>
          <button
            onClick={() => void run(onTogglePublish, published ? "Curso despublicado" : "✓ Curso publicado", { pending: published ? "Despublicando curso…" : "Publicando curso…", retryable: true })}
            disabled={busy}
            className="min-h-11 px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-80 disabled:opacity-60"
            style={published ? { backgroundColor: "#B58A43", color: "#FAF8F5", borderColor: "#B58A43" } : { color: "#173B6C", borderColor: "#173B6C" }}
          >
            {published ? "PUBLICADO" : "BORRADOR"}
          </button>
          <button onClick={() => setStatsOpen(true)} className="min-h-11 px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-70" style={{ color: "#173B6C", borderColor: "#173B6C" }}>
            VER ESTADÍSTICAS
          </button>
        </div>
      </div>

      {operationFeedback && <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded border px-4 py-3 text-sm ${operationFeedback.type === "error" ? "border-[#72132C]/30 bg-[#72132C]/5 text-[#72132C]" : operationFeedback.type === "success" ? "border-[#2d7a4b]/25 bg-[#2d7a4b]/5 text-[#245f3c]" : "border-[#B58A43]/30 bg-white text-[#173B6C]"}`} role={operationFeedback.type === "error" ? "alert" : "status"} aria-live={operationFeedback.type === "error" ? "assertive" : "polite"}>
        <span>{operationFeedback.type === "saving" ? "⏳ " : operationFeedback.type === "success" ? "✓ " : ""}{operationFeedback.message}</span>
        {operationFeedback.retry && <button type="button" onClick={operationFeedback.retry} disabled={busy} className="min-h-10 px-3 font-semibold underline underline-offset-2 disabled:opacity-50">{operationFeedback.retryLabel ?? "Reintentar"}</button>}
        {operationFeedback.type !== "saving" && !creationBlocked && <button type="button" onClick={() => setOperationFeedback(null)} aria-label="Cerrar aviso" className="min-h-10 px-2 text-lg leading-none">×</button>}
      </div>}

      {/* Module editor */}
      <div className="mb-8 rounded-lg p-4 sm:p-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
        <h3 className="text-lg font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Estructura del Curso</h3>
        <div className="space-y-3">
          {modules.map((mod, moduleIndex) => (
            <div key={mod.id} className="rounded" style={{ border: "1px solid rgba(23,59,108,0.1)" }}>
              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 cursor-pointer hover:opacity-80" onClick={() => onToggleModule(mod.id)}>
                <span className="break-words text-sm font-bold" style={{ color: "#173B6C" }}>Módulo {moduleIndex + 1}: {mod.title}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ["EDITAR", (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setRenaming({ id: mod.id, title: mod.title });
                    }],
                    ["ELIMINAR", (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (window.confirm(`¿Eliminar el módulo "${mod.title}"? Se eliminarán sus lecciones.`)) {
                        void run(() => onDeleteModule(mod.id), "Módulo eliminado", { pending: "Eliminando módulo…", verifyBeforeRetry: true });
                      }
                    }],
                    ["↑", (e: React.MouseEvent) => { e.stopPropagation(); void run(() => onMoveModule(mod.id, "up"), "Orden actualizado", { pending: "Actualizando orden…", retryable: true }); }],
                    ["↓", (e: React.MouseEvent) => { e.stopPropagation(); void run(() => onMoveModule(mod.id, "down"), "Orden actualizado", { pending: "Actualizando orden…", retryable: true }); }],
                  ] as [string, (e: React.MouseEvent) => void][]).map(([btn, fn]) => (
                    <button
                      key={btn}
                      aria-label={btn === "↑" ? `Mover módulo ${mod.title} hacia arriba` : btn === "↓" ? `Mover módulo ${mod.title} hacia abajo` : `${btn} módulo ${mod.title}`}
                      className="min-h-10 min-w-10 rounded border px-2 text-[10px] font-medium transition-all hover:border-yellow-500 hover:text-yellow-600"
                      style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.25)" }}
                      onClick={fn}
                      disabled={busy}
                    >
                      {btn}
                    </button>
                  ))}
                  <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2" className={`w-4 h-4 transition-transform ${expandedModules.includes(mod.id) ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
              {expandedModules.includes(mod.id) && (
                <div className="px-4 pb-4 space-y-2" style={{ borderTop: "1px solid rgba(23,59,108,0.06)" }}>
                  {mod.lessons.map((lesson, lessonIdx) => (
                    <div key={lesson.id ?? `${lesson.title}-${lessonIdx}`} className="flex flex-col gap-2 rounded px-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2 sm:pl-4 sm:pr-2" style={{ backgroundColor: "rgba(23,59,108,0.02)" }}>
                      <span className="min-w-0 break-words text-xs" style={{ color: "#173B6C" }}>{lesson.id ? `${lesson.id}: ` : ""}{lesson.title}</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          disabled={busy}
                          className="min-h-10 px-3 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all disabled:opacity-50"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { setEditorMode("edit"); setEditing({ moduleId: mod.id, moduleName: `Módulo ${moduleIndex + 1}: ${mod.title}`, lesson }); setEditorOpen(true); }}
                        >
                          EDITAR
                        </button>
                        <button
                          disabled={busy}
                          className="min-h-10 px-3 text-[10px] border rounded hover:border-red-400 hover:text-red-500 transition-all disabled:opacity-50"
                          style={{ color: "#72132C", borderColor: "rgba(114,19,44,0.2)" }}
                          onClick={() => {
                            if (lesson.id && window.confirm(`¿Eliminar la lección "${lesson.title}"?`)) {
                              void run(() => onDeleteLesson(mod.id, lesson.id!), "Lección eliminada", { pending: "Eliminando lección…", verifyBeforeRetry: true });
                            }
                          }}
                        >
                          ELIMINAR
                        </button>
                        <button
                          disabled={busy}
                          aria-label={`Mover lección ${lesson.title} hacia arriba`}
                          className="min-h-10 min-w-10 px-2 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all disabled:opacity-50"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { if (lesson.id) void run(() => onMoveLesson(mod.id, lesson.id!, "up"), "Orden actualizado", { pending: "Actualizando orden…", retryable: true }); }}
                        >↑</button>
                        <button
                          disabled={busy}
                          aria-label={`Mover lección ${lesson.title} hacia abajo`}
                          className="min-h-10 min-w-10 px-2 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all disabled:opacity-50"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { if (lesson.id) void run(() => onMoveLesson(mod.id, lesson.id!, "down"), "Orden actualizado", { pending: "Actualizando orden…", retryable: true }); }}
                        >↓</button>
                      </div>
                    </div>
                  ))}
                  <button
                    disabled={busy || creationBlocked}
                    className="min-h-11 text-xs font-medium flex items-center gap-1 mt-2 hover:opacity-70 transition-opacity disabled:opacity-50"
                    style={{ color: "#B58A43" }}
                    onClick={() => { setEditorMode("new"); setEditing({ moduleId: mod.id, moduleName: `Módulo ${moduleIndex + 1}: ${mod.title}` }); setEditorOpen(true); }}
                  >
                    + AGREGAR LECCIÓN
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* New module input */}
        {showNewModule ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              disabled={busy || creationBlocked}
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newModuleTitle.trim()) {
                  const idempotencyKey = newIdempotencyKey();
                  void run(async () => {
                    await onAddModule(newModuleTitle.trim(), idempotencyKey);
                    setNewModuleTitle("");
                    setShowNewModule(false);
                  }, "✓ Módulo creado", { pending: "Creando módulo…", creation: true, retryable: true });
                }
                if (e.key === "Escape") setShowNewModule(false);
              }}
              placeholder="Título del nuevo módulo..."
              className="min-h-11 min-w-0 flex-1 px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={{ border: "1px solid #B58A43", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
            />
            <button
              onClick={() => {
                if (!newModuleTitle.trim()) return;
                const idempotencyKey = newIdempotencyKey();
                void run(async () => {
                  await onAddModule(newModuleTitle.trim(), idempotencyKey);
                  setNewModuleTitle("");
                  setShowNewModule(false);
                }, "✓ Módulo creado", { pending: "Creando módulo…", creation: true, retryable: true });
              }}
              disabled={busy || creationBlocked}
              className="min-h-11 px-4 py-2 text-xs font-bold hover:brightness-110 transition-all disabled:opacity-60"
              style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}
            >
              CREAR
            </button>
            <button disabled={busy} onClick={() => setShowNewModule(false)} className="min-h-11 px-4 py-2 text-xs font-medium border hover:opacity-70 transition-opacity disabled:opacity-50" style={{ color: "#173B6C", borderColor: "#173B6C", borderRadius: 4 }}>
              CANCELAR
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewModule(true)}
            disabled={busy || creationBlocked}
            className="mt-4 min-h-11 px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
            style={{ backgroundColor: "#B58A43", color: "#173B6C" }}
          >
            + CREAR NUEVO MÓDULO
          </button>
        )}

        {renaming && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              disabled={busy}
              value={renaming.title}
              onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renaming.title.trim()) {
                  void run(async () => {
                    await onRenameModule(renaming.id, renaming.title.trim());
                    setRenaming(null);
                  }, "✓ Módulo actualizado", { pending: "Actualizando módulo…", retryable: true });
                }
                if (e.key === "Escape") setRenaming(null);
              }}
              className="min-h-11 min-w-0 flex-1 px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={{ border: "1px solid #B58A43", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
            />
            <button
              onClick={() => {
                if (!renaming.title.trim()) return;
                void run(async () => {
                  await onRenameModule(renaming.id, renaming.title.trim());
                  setRenaming(null);
                }, "✓ Módulo actualizado", { pending: "Actualizando módulo…", retryable: true });
              }}
              disabled={busy}
              className="min-h-11 px-4 py-2 text-xs font-bold hover:brightness-110 transition-all disabled:opacity-60"
              style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}
            >
              GUARDAR
            </button>
            <button disabled={busy} onClick={() => setRenaming(null)} className="min-h-11 px-4 py-2 text-xs font-medium border hover:opacity-70 transition-opacity disabled:opacity-50" style={{ color: "#173B6C", borderColor: "#173B6C", borderRadius: 4 }}>
              CANCELAR
            </button>
          </div>
        )}
      </div>

      {/* Students table */}
      <div className="rounded-lg overflow-hidden shadow-sm" style={{ border: "1px solid rgba(23,59,108,0.08)" }}>
        <div className="px-5 py-4" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid rgba(23,59,108,0.08)" }}>
          <h3 className="text-lg font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Alumnos del Curso</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "#173B6C" }}>
                {["Nombre", "Email", "% Progreso", "Última Actividad", "Mensajes", "Acciones"].map((col) => (
                  <th key={col} className="px-4 py-3 text-left font-medium cursor-pointer select-none" style={{ color: "#FAF8F5" }} onClick={() => onSort(col.toLowerCase())}>
                    <span className="flex items-center gap-1">
                      {col}
                      {sortCol === col.toLowerCase() && <span style={{ color: "#B58A43" }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center" style={{ color: "rgba(23,59,108,0.55)" }}>
                    Todavía no hay alumnos inscriptos en este curso.
                  </td>
                </tr>
              ) : students.map((s, i) => (
                <tr key={s.email} style={{ backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F5F5F5" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#173B6C" }}>{s.name}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.65)" }}>{s.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${s.progress}%`, backgroundColor: "#B58A43" }} />
                      </div>
                      <span style={{ color: "#173B6C" }}>{s.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: "rgba(23,59,108,0.6)" }}>{s.last}</td>
                  <td className="px-4 py-3">
                    {s.msgs > 0
                      ? <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>{s.msgs}</span>
                      : <span style={{ color: "rgba(23,59,108,0.4)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => setStudentModal({ type: "ver", student: s })} className="text-xs font-medium underline underline-offset-1 hover:opacity-60" style={{ color: "#173B6C" }}>Ver</button>
                      <button onClick={() => { setChatInput(""); setStudentModal({ type: "chat", student: s }); }} className="text-xs font-medium underline underline-offset-1 hover:opacity-60" style={{ color: "#173B6C" }}>Chat</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lesson Editor Modal */}
      {editorOpen && <LessonEditorModal
        mode={editorMode}
        lessonTitle={editing?.lesson?.title}
        moduleName={editing?.moduleName}
        initialBlocks={editing?.lesson?.content}
        initialDocument={editing?.lesson?.document}
        initialType={(editing?.lesson?.type as LessonType | undefined) ?? "doc"}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditorSave}
      />}

      {/* Student "Ver" modal */}
      {studentModal?.type === "ver" && (
        <Modal title={studentModal.student.name} onClose={() => setStudentModal(null)}>
          <div className="space-y-3">
            {[
              ["Email", studentModal.student.email],
              ["Progreso", `${studentModal.student.progress}%`],
              ["Última actividad", studentModal.student.last],
              ["Mensajes sin leer", String(studentModal.student.msgs)],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(23,59,108,0.06)" }}>
                <span className="text-xs font-medium" style={{ color: "rgba(23,59,108,0.6)" }}>{label}</span>
                <span className="text-xs font-semibold" style={{ color: "#173B6C" }}>{val}</span>
              </div>
            ))}
            <div className="mt-2">
              <p className="text-xs font-medium mb-1" style={{ color: "rgba(23,59,108,0.6)" }}>Progreso del curso</p>
              <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#E0E0E0" }}>
                <div className="h-2 rounded-full transition-all" style={{ width: `${studentModal.student.progress}%`, backgroundColor: "#B58A43" }} />
              </div>
            </div>
          </div>
          <button onClick={() => setStudentModal(null)} className="mt-5 w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
            CERRAR
          </button>
        </Modal>
      )}

      {/* Student "Chat" modal */}
      {studentModal?.type === "chat" && (
        <Modal title={`Chat con ${studentModal.student.name}`} onClose={() => setStudentModal(null)} variant="chat">
          {chatLoading && <p role="status" className="mb-3 text-xs" style={{ color: "#173B6C" }}>Cargando mensajes...</p>}
          {chatError && (
            <div role="alert" className="mb-3 text-xs" style={{ color: "#72132C" }}>
              {chatError} <button type="button" onClick={retryChat} className="underline">Reintentar</button>
            </div>
          )}
          <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} role="log" aria-label="Mensajes de la conversación" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-2 pr-1">
            {!chatLoading && !chatError && chatMessages.length === 0 && (
              <p className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>No hay mensajes todavía.</p>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.from === "prof" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] break-words rounded-lg px-3 py-2 text-sm leading-relaxed" style={msg.from === "prof" ? { backgroundColor: "#B58A43", color: "#FAF8F5" } : { backgroundColor: "#F0F0F0", color: "#173B6C" }}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-[#e5ded2] pt-4">
            <input
              autoFocus
              aria-label={`Mensaje para ${studentModal.student.name}`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !chatSending) void sendChat(); }}
              placeholder="Escribe tu respuesta..."
              className="min-w-0 flex-1 px-3 py-2 text-base outline-none sm:text-sm"
              style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
            />
            <button type="button" onClick={() => void sendChat()} disabled={chatSending || !chatInput.trim()}
              aria-label={chatSending ? "Enviando mensaje" : "Enviar mensaje"}
              className="min-h-11 min-w-11 px-3 py-2 text-sm font-bold hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}>
              {chatSending ? "…" : "→"}
            </button>
          </div>
        </Modal>
      )}

      {/* Stats modal */}
      {statsOpen && (
        <Modal title="Estadísticas del Curso" onClose={() => setStatsOpen(false)}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: "Alumnos activos", value: `${students.length}` },
              { label: "Progreso promedio", value: `${averageProgress}%` },
              { label: "Mensajes sin leer", value: `${students.reduce((s, a) => s + a.msgs, 0)}` },
              { label: "Módulos creados", value: `${modules.length}` },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded" style={{ backgroundColor: "#F5F5F5" }}>
                <p className="text-2xl font-light" style={{ color: "#B58A43", fontFamily: "'Cormorant Garamond', serif" }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(23,59,108,0.65)" }}>{label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setStatsOpen(false)} className="w-full py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>CERRAR</button>
        </Modal>
      )}

      {courseEditOpen && (
        <Modal title="Editar Curso" onClose={() => { if (!busy) setCourseEditOpen(false); }}>
          <div className="space-y-4 mb-5">
            <label className="block text-xs font-medium" htmlFor="teacher-course-title">Título</label>
            <input id="teacher-course-title" disabled={busy} value={courseForm.title} maxLength={180} onChange={(e) => setCourseForm((prev) => ({ ...prev, title: e.target.value }))} className="min-h-11 w-full border px-3 py-2 text-sm disabled:opacity-60" />
            <label className="block text-xs font-medium" htmlFor="teacher-course-description">Descripción</label>
            <textarea id="teacher-course-description" disabled={busy} value={courseForm.description} maxLength={2000} onChange={(e) => setCourseForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full border px-3 py-2 text-sm disabled:opacity-60" rows={4} />
            <div className="rounded border border-[#e5ded2] p-3">
              <p className="mb-2 text-xs font-medium text-[#173B6C]">Imagen actual del curso</p>
              {courseImage ? <img src={courseImage} alt={courseTitle} className="aspect-video max-h-40 w-full rounded object-cover" /> : <p className="text-xs text-[#64748b]">Este curso no tiene imagen cargada.</p>}
              <p className="mt-2 text-xs text-[#64748b]">La edición de imágenes está pausada hasta definir el almacenamiento.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => {
              if (courseForm.title.trim().length < 3 || courseForm.description.trim().length < 3) {
                showToast("Ingresá un título y una descripción válidos.", true);
                return;
              }
              void run(async () => { await onUpdateCourse({ title: courseForm.title.trim(), description: courseForm.description.trim() }); setCourseEditOpen(false); }, "✓ Curso actualizado", { pending: "Guardando curso…", retryable: true });
            }} className="min-h-11 flex-1 py-2.5 text-xs font-bold disabled:opacity-60" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>{busy ? "GUARDANDO…" : "GUARDAR"}</button>
            <button type="button" disabled={busy} onClick={() => setCourseEditOpen(false)} className="min-h-11 flex-1 border py-2.5 text-xs disabled:opacity-50">CANCELAR</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.text} error={toast.error} />}
    </>
  );
}
