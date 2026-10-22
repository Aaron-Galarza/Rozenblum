"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ChatMessageDTO, ConversationDTO, LessonBlockDTO, LessonType, RichLessonDocument } from "@rozenblum/shared";
import type { EditableModule, EditableLesson, ProfesorStudent, SortDir } from "../../types";
const LessonEditorModal = dynamic(() => import("./RichLessonEditorModal"), { ssr: false });
import Modal from "../../components/ui/Modal";
import Toast from "../../components/ui/Toast";

type LessonPayload = { title: string; type: LessonType; content: LessonBlockDTO[]; document: RichLessonDocument };

type CourseEditorProps = {
  courseId: number;
  courseTitle: string;
  courseDescription: string;
  courseImage: string;
  published: boolean;
  modules: EditableModule[];
  students: ProfesorStudent[];
  conversations: ConversationDTO[];
  expandedModules: number[];
  sortCol: string;
  sortDir: SortDir;
  onToggleModule: (id: number) => void;
  onSort: (col: string) => void;
  onTogglePublish: () => Promise<void>;
  onUpdateCourse: (patch: { title: string; description: string; img: string }) => Promise<void>;
  onAddModule: (title: string) => Promise<void>;
  onRenameModule: (id: number, title: string) => Promise<void>;
  onDeleteModule: (id: number) => Promise<void>;
  onMoveModule: (id: number, dir: "up" | "down") => Promise<void>;
  onAddLesson: (moduleId: number, payload: LessonPayload) => Promise<void>;
  onUpdateLesson: (moduleId: number, lessonId: string, payload: LessonPayload) => Promise<void>;
  onDeleteLesson: (moduleId: number, lessonId: string) => Promise<void>;
  onMoveLesson: (moduleId: number, lessonId: string, dir: "up" | "down") => Promise<void>;
  onSendMessage: (conversationId: string, text: string) => Promise<ChatMessageDTO[]>;
};

type StudentModal = { type: "ver" | "chat"; student: ProfesorStudent } | null;


export default function CourseEditor({
  courseId,
  courseTitle,
  courseDescription,
  courseImage,
  published,
  modules,
  students,
  conversations,
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
  onSendMessage,
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
  const [chatMessages, setChatMessages] = useState<ChatMessageDTO[]>([]);
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [courseEditOpen, setCourseEditOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: courseTitle, description: courseDescription, img: courseImage });
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    if (studentModal?.type === "chat") {
      const conversation = conversations.find((item) => item.peerEmail === studentModal.student.email);
      setChatMessages(conversation?.messages ?? []);
    }
  }, [studentModal, conversations]);

  const run = async (action: () => Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  };

  const handleEditorSave = async (payload: LessonPayload) => {
    if (!editing) return;
    if (editorMode === "new") {
      await onAddLesson(editing.moduleId, payload);
      showToast("✓ Lección creada");
    } else if (editing.lesson?.id) {
      await onUpdateLesson(editing.moduleId, editing.lesson.id, payload);
      showToast("✓ Lección guardada");
    }
    setEditorOpen(false);
  };

  const handleAutoSave = useCallback(
    async (payload: LessonPayload) => {
      if (editing?.lesson?.id) {
        await onUpdateLesson(editing.moduleId, editing.lesson.id, payload);
      }
    },
    [editing, onUpdateLesson],
  );

  const sendChat = async () => {
    if (!chatInput.trim() || !studentModal) return;
    const conversation = conversations.find((item) => item.peerEmail === studentModal.student.email);
    if (!conversation) {
      showToast("Todavía no hay una conversación con este alumno.");
      return;
    }
    const text = chatInput.trim();
    try {
      const updated = await onSendMessage(conversation.id, text);
      setChatMessages(updated);
      setChatInput("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo enviar el mensaje.");
    }
  };

  const averageProgress = students.length
    ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / students.length)
    : 0;

  return (
    <>
      {/* Course header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-3xl font-light" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{courseTitle}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setCourseForm({ title: courseTitle, description: courseDescription, img: courseImage }); setCourseEditOpen(true); }}
            className="px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-70"
            style={{ color: "#173B6C", borderColor: "#173B6C" }}
          >
            EDITAR
          </button>
          <button
            onClick={() => void run(onTogglePublish, published ? "Curso despublicado" : "✓ Curso publicado")}
            disabled={busy}
            className="px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-80 disabled:opacity-60"
            style={published ? { backgroundColor: "#B58A43", color: "#FAF8F5", borderColor: "#B58A43" } : { color: "#173B6C", borderColor: "#173B6C" }}
          >
            {published ? "PUBLICADO" : "BORRADOR"}
          </button>
          <button onClick={() => setStatsOpen(true)} className="px-4 py-2 text-xs font-medium tracking-wide border transition-all hover:opacity-70" style={{ color: "#173B6C", borderColor: "#173B6C" }}>
            VER ESTADÍSTICAS
          </button>
        </div>
      </div>

      {/* Module editor */}
      <div className="mb-8 p-6 rounded-lg" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(23,59,108,0.08)" }}>
        <h3 className="text-lg font-medium mb-5" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Estructura del Curso</h3>
        <div className="space-y-3">
          {modules.map((mod) => (
            <div key={mod.id} className="rounded" style={{ border: "1px solid rgba(23,59,108,0.1)" }}>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:opacity-80" onClick={() => onToggleModule(mod.id)}>
                <span className="text-sm font-bold" style={{ color: "#173B6C" }}>Módulo {mod.id}: {mod.title}</span>
                <div className="flex items-center gap-2">
                  {([
                    ["EDITAR", (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setRenaming({ id: mod.id, title: mod.title });
                    }],
                    ["ELIMINAR", (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (window.confirm(`¿Eliminar el módulo "${mod.title}"? Se eliminarán sus lecciones.`)) {
                        void run(() => onDeleteModule(mod.id), "Módulo eliminado");
                      }
                    }],
                    ["↑", (e: React.MouseEvent) => { e.stopPropagation(); void run(() => onMoveModule(mod.id, "up"), "Orden actualizado"); }],
                    ["↓", (e: React.MouseEvent) => { e.stopPropagation(); void run(() => onMoveModule(mod.id, "down"), "Orden actualizado"); }],
                  ] as [string, (e: React.MouseEvent) => void][]).map(([btn, fn]) => (
                    <button
                      key={btn}
                      className="px-2 py-0.5 text-[10px] font-medium border rounded transition-all hover:border-yellow-500 hover:text-yellow-600"
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
                    <div key={lesson.id ?? `${lesson.title}-${lessonIdx}`} className="flex items-center justify-between py-2 pl-4 pr-2 rounded" style={{ backgroundColor: "rgba(23,59,108,0.02)" }}>
                      <span className="text-xs" style={{ color: "#173B6C" }}>{lesson.id ? `${lesson.id}: ` : ""}{lesson.title}</span>
                      <div className="flex gap-1.5">
                        <button
                          className="px-2 py-0.5 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { setEditorMode("edit"); setEditing({ moduleId: mod.id, moduleName: `Módulo ${mod.id}: ${mod.title}`, lesson }); setEditorOpen(true); }}
                        >
                          EDITAR
                        </button>
                        <button
                          className="px-2 py-0.5 text-[10px] border rounded hover:border-red-400 hover:text-red-500 transition-all"
                          style={{ color: "#72132C", borderColor: "rgba(114,19,44,0.2)" }}
                          onClick={() => {
                            if (lesson.id && window.confirm(`¿Eliminar la lección "${lesson.title}"?`)) {
                              void run(() => onDeleteLesson(mod.id, lesson.id!), "Lección eliminada");
                            }
                          }}
                        >
                          ELIMINAR
                        </button>
                        <button
                          className="px-2 py-0.5 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { if (lesson.id) void run(() => onMoveLesson(mod.id, lesson.id!, "up"), "Orden actualizado"); }}
                        >↑</button>
                        <button
                          className="px-2 py-0.5 text-[10px] border rounded hover:border-yellow-500 hover:text-yellow-600 transition-all"
                          style={{ color: "#173B6C", borderColor: "rgba(23,59,108,0.2)" }}
                          onClick={() => { if (lesson.id) void run(() => onMoveLesson(mod.id, lesson.id!, "down"), "Orden actualizado"); }}
                        >↓</button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="text-xs font-medium flex items-center gap-1 mt-2 hover:opacity-70 transition-opacity"
                    style={{ color: "#B58A43" }}
                    onClick={() => { setEditorMode("new"); setEditing({ moduleId: mod.id, moduleName: `Módulo ${mod.id}: ${mod.title}` }); setEditorOpen(true); }}
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
          <div className="flex items-center gap-2 mt-4">
            <input
              autoFocus
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newModuleTitle.trim()) {
                  void run(async () => {
                    await onAddModule(newModuleTitle.trim());
                    setNewModuleTitle("");
                    setShowNewModule(false);
                  }, "✓ Módulo creado");
                }
                if (e.key === "Escape") setShowNewModule(false);
              }}
              placeholder="Título del nuevo módulo..."
              className="flex-1 px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #B58A43", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
            />
            <button
              onClick={() => {
                if (!newModuleTitle.trim()) return;
                void run(async () => {
                  await onAddModule(newModuleTitle.trim());
                  setNewModuleTitle("");
                  setShowNewModule(false);
                }, "✓ Módulo creado");
              }}
              disabled={busy}
              className="px-4 py-2 text-xs font-bold hover:brightness-110 transition-all disabled:opacity-60"
              style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}
            >
              CREAR
            </button>
            <button onClick={() => setShowNewModule(false)} className="px-4 py-2 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C", borderRadius: 4 }}>
              CANCELAR
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewModule(true)}
            className="mt-4 px-5 py-2.5 text-xs font-bold tracking-widest hover:brightness-110 transition-all"
            style={{ backgroundColor: "#B58A43", color: "#173B6C" }}
          >
            + CREAR NUEVO MÓDULO
          </button>
        )}

        {renaming && (
          <div className="flex items-center gap-2 mt-4">
            <input
              autoFocus
              value={renaming.title}
              onChange={(e) => setRenaming({ ...renaming, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renaming.title.trim()) {
                  void run(async () => {
                    await onRenameModule(renaming.id, renaming.title.trim());
                    setRenaming(null);
                  }, "✓ Módulo actualizado");
                }
                if (e.key === "Escape") setRenaming(null);
              }}
              className="flex-1 px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #B58A43", borderRadius: 4, color: "#173B6C", backgroundColor: "#FAF8F5" }}
            />
            <button
              onClick={() => {
                if (!renaming.title.trim()) return;
                void run(async () => {
                  await onRenameModule(renaming.id, renaming.title.trim());
                  setRenaming(null);
                }, "✓ Módulo actualizado");
              }}
              className="px-4 py-2 text-xs font-bold hover:brightness-110 transition-all"
              style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}
            >
              GUARDAR
            </button>
            <button onClick={() => setRenaming(null)} className="px-4 py-2 text-xs font-medium border hover:opacity-70 transition-opacity" style={{ color: "#173B6C", borderColor: "#173B6C", borderRadius: 4 }}>
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
                      <button onClick={() => setStudentModal({ type: "chat", student: s })} className="text-xs font-medium underline underline-offset-1 hover:opacity-60" style={{ color: "#173B6C" }}>Chat</button>
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
        initialType={(editing?.lesson?.type as LessonType | undefined) ?? "video"}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditorSave}
        onAutoSave={handleAutoSave}
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
        <Modal title={`Chat con ${studentModal.student.name}`} onClose={() => setStudentModal(null)}>
          <div className="space-y-3 max-h-56 overflow-y-auto mb-3">
            {chatMessages.length === 0 && (
              <p className="text-xs" style={{ color: "rgba(23,59,108,0.55)" }}>No hay mensajes todavía.</p>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.from === "prof" ? "justify-end" : "justify-start"}`}>
                <div className="px-3 py-2 text-xs rounded-lg max-w-[85%]" style={msg.from === "prof" ? { backgroundColor: "#B58A43", color: "#FAF8F5" } : { backgroundColor: "#F0F0F0", color: "#173B6C" }}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void sendChat(); }}
              placeholder="Escribe tu respuesta..."
              className="flex-1 px-3 py-2 text-xs outline-none"
              style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
            />
            <button onClick={() => void sendChat()} className="px-3 py-2 text-xs font-bold hover:brightness-110 transition-all" style={{ backgroundColor: "#B58A43", color: "#173B6C", borderRadius: 4 }}>
              →
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
        <Modal title="Editar Curso" onClose={() => setCourseEditOpen(false)}>
          <div className="space-y-4 mb-5">
            <label className="block text-xs font-medium" htmlFor="teacher-course-title">Título</label>
            <input id="teacher-course-title" value={courseForm.title} maxLength={180} onChange={(e) => setCourseForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full px-3 py-2 border text-sm" />
            <label className="block text-xs font-medium" htmlFor="teacher-course-description">Descripción</label>
            <textarea id="teacher-course-description" value={courseForm.description} maxLength={2000} onChange={(e) => setCourseForm((prev) => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 border text-sm" rows={4} />
            <label className="block text-xs font-medium" htmlFor="teacher-course-image">URL de imagen</label>
            <input id="teacher-course-image" type="url" value={courseForm.img} onChange={(e) => setCourseForm((prev) => ({ ...prev, img: e.target.value }))} className="w-full px-3 py-2 border text-sm" />
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => {
              if (courseForm.title.trim().length < 3 || courseForm.description.trim().length < 3 || !/^https?:\/\//i.test(courseForm.img)) {
                showToast("Ingresá un título y descripción válidos y una URL de imagen http(s).");
                return;
              }
              void run(async () => { await onUpdateCourse({ title: courseForm.title.trim(), description: courseForm.description.trim(), img: courseForm.img.trim() }); setCourseEditOpen(false); }, "✓ Curso actualizado");
            }} className="flex-1 py-2.5 text-xs font-bold" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>GUARDAR</button>
            <button onClick={() => setCourseEditOpen(false)} className="flex-1 py-2.5 text-xs border">CANCELAR</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
