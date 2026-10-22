"use client";

import type { LessonBlockDTO } from "@rozenblum/shared";
import dynamic from "next/dynamic";
import type { Lesson } from "../../types";

const RichLessonViewer = dynamic(() => import("./RichLessonViewer"), { ssr: false });

type LessonViewerProps = {
  selectedLesson: Lesson;
  courseTitle: string;
  professor: string;
  progress: number;
  completed: boolean;
  saving?: boolean;
  onToggleCompleted: () => void;
  onPrevLesson: () => void;
  onNextLesson: () => void;
  hasPrev: boolean;
  hasNext: boolean;
};

function Block({ block }: { block: LessonBlockDTO }) {
  const base = { color: "rgba(23,59,108,0.8)" };
  switch (block.type) {
    case "h1":
      return <h4 className="text-2xl font-medium mt-5 mb-2" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{block.content}</h4>;
    case "h2":
      return <h5 className="text-xl font-medium mt-5 mb-2" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>{block.content}</h5>;
    case "h3":
      return <h6 className="text-base font-bold mt-4 mb-1.5" style={{ color: "#173B6C" }}>{block.content}</h6>;
    case "bullet":
      return (
        <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed" style={base}>
          {(block.items ?? [block.content]).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      );
    case "numbered":
      return (
        <ol className="list-decimal pl-5 space-y-1 text-sm leading-relaxed" style={base}>
          {(block.items ?? [block.content]).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 pl-4 my-3 text-sm italic leading-relaxed" style={{ borderColor: "#B58A43", color: "rgba(23,59,108,0.75)" }}>
          {block.content}
        </blockquote>
      );
    case "toggle":
      return (
        <details className="my-3 p-3 rounded" style={{ backgroundColor: "rgba(23,59,108,0.03)", border: "1px solid rgba(23,59,108,0.08)" }}>
          <summary className="text-sm font-semibold cursor-pointer" style={{ color: "#173B6C" }}>{block.content}</summary>
          {block.toggleContent && <p className="text-sm leading-relaxed mt-2" style={base}>{block.toggleContent}</p>}
        </details>
      );
    case "link":
      return (
        <a href={block.content} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2" style={{ color: "#9A7435" }}>
          {block.content}
        </a>
      );
    case "code":
      return (
        <pre className="my-3 p-3 rounded text-xs overflow-x-auto" style={{ backgroundColor: "#173B6C", color: "#FAF8F5" }}>
          <code>{block.content}</code>
        </pre>
      );
    default:
      return <p className="text-sm leading-relaxed" style={base}>{block.content}</p>;
  }
}

export default function LessonViewer({
  selectedLesson,
  courseTitle,
  professor,
  progress,
  completed,
  saving,
  onToggleCompleted,
  onPrevLesson,
  onNextLesson,
  hasPrev,
  hasNext,
}: LessonViewerProps) {
  const hasEmbeddedMedia = selectedLesson.document?.blocks.some((block) =>
    selectedLesson.type === "video"
      ? block.type === "youtube" || block.type === "video"
      : block.type === "file" || block.type === "image",
  );
  return (
    <main className="flex-1 overflow-y-auto">
      {/* Course header gradient */}
      <div className="px-10 py-8" style={{ background: "linear-gradient(135deg, #173B6C 0%, #1e4d8c 100%)" }}>
        <h2 className="text-3xl font-bold mb-1" style={{ color: "#FAF8F5", fontFamily: "'Cormorant Garamond', serif" }}>{courseTitle}</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(250,248,245,0.85)" }}>{professor}</p>
        <div>
          <div className="w-full h-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
            <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: "#B58A43" }} />
          </div>
          <p className="text-xs mt-2" style={{ color: "rgba(250,248,245,0.75)" }}>{progress}% completado</p>
        </div>
      </div>

      {/* Lesson content */}
      <div className="p-8 max-w-3xl">
        <div className="p-8 rounded-lg shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <h3 className="text-2xl font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
              Lección {selectedLesson.id}: {selectedLesson.title}
            </h3>
            <span className="px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase" style={{ backgroundColor: "#B58A43", color: "#173B6C" }}>
              {selectedLesson.type === "video" ? "Video" : selectedLesson.type === "pdf" ? "PDF" : selectedLesson.type === "ppt" ? "PowerPoint" : "Documento"}
            </span>
          </div>

          {/* Media viewer */}
          {hasEmbeddedMedia ? null : selectedLesson.type === "video" ? (
            <div className="w-full rounded overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "#0f172a" }}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#B58A43" }}>
                    <svg viewBox="0 0 24 24" fill="#173B6C" className="w-7 h-7 ml-1"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </div>
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Video no adjunto a esta lección</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-64 rounded flex items-center justify-center" style={{ backgroundColor: "#F0F0F0" }}>
              <div className="text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="1.5" className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.4 }}>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <p className="text-sm font-medium" style={{ color: "rgba(23,59,108,0.5)" }}>
                  {selectedLesson.type === "pdf" ? "PDF" : selectedLesson.type === "ppt" ? "PowerPoint" : "Documento"} no adjunto a esta lección
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mt-8">
            <p className="text-base font-bold mb-3" style={{ color: "#173B6C" }}>Notas de la lección</p>
            {selectedLesson.document?.blocks.length ? (
              <RichLessonViewer key={selectedLesson.id} document={selectedLesson.document} />
            ) : selectedLesson.content && selectedLesson.content.length > 0 ? (
              <div className="space-y-3">
                {selectedLesson.content.map((block) => <Block key={block.id} block={block} />)}
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.75)" }}>
                Esta lección todavía no tiene notas cargadas. Escribile al profesor desde el panel de mensajes si necesitás ayuda.
              </p>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 gap-3 flex-wrap">
            <button
              onClick={onPrevLesson}
              disabled={!hasPrev}
              className="px-6 py-3 text-xs font-bold tracking-widest border rounded transition-all duration-200 hover:border-yellow-600 hover:text-yellow-700 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "#173B6C", borderColor: "#173B6C" }}
            >
              ← LECCIÓN ANTERIOR
            </button>
            <button
              onClick={onToggleCompleted}
              disabled={completed || saving}
              className="px-6 py-3 text-xs font-bold tracking-widest rounded transition-all duration-200 hover:brightness-110 disabled:cursor-default"
              style={completed
                ? { color: "#22c55e", backgroundColor: "#FFFFFF", border: "2px solid #22c55e" }
                : { backgroundColor: "#B58A43", color: "#173B6C" }}
            >
              {saving ? "GUARDANDO..." : completed ? "✓ COMPLETADA" : "MARCAR COMO COMPLETADA"}
            </button>
            <button
              onClick={onNextLesson}
              disabled={!hasNext}
              className="px-6 py-3 text-xs font-bold tracking-widest border rounded transition-all duration-200 hover:border-yellow-600 hover:text-yellow-700 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "#173B6C", borderColor: "#173B6C" }}
            >
              SIGUIENTE LECCIÓN →
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
