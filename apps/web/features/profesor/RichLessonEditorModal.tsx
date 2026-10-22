"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { LessonBlockDTO, LessonType, RichLessonDocument } from "@rozenblum/shared";
import { useModalA11y } from "../../lib/use-modal-a11y";
import { lessonSchema, noteBlocks, serializeNote, youtubeId } from "../../lib/lesson-document";

export type LessonEditorPayload = {
  title: string;
  type: LessonType;
  content: LessonBlockDTO[];
  document: RichLessonDocument;
};

type Props = {
  mode: "new" | "edit";
  lessonTitle?: string;
  moduleName?: string;
  initialBlocks?: LessonBlockDTO[];
  initialDocument?: RichLessonDocument;
  initialType?: LessonType;
  onClose: () => void;
  onSave: (payload: LessonEditorPayload) => Promise<void> | void;
  onAutoSave?: (payload: LessonEditorPayload) => Promise<void> | void;
};

const isWebUrl = (value: string) => {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
};

export default function RichLessonEditorModal({ mode, lessonTitle, moduleName, initialBlocks, initialDocument, initialType, onClose, onSave, onAutoSave }: Props) {
  const titleId = useId();
  const [title, setTitle] = useState(lessonTitle ?? "");
  const [type, setType] = useState<LessonType>(initialType ?? "doc");
  const [pendingUrl, setPendingUrl] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const initialContent = useMemo(() => noteBlocks(initialDocument, initialBlocks), []);
  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent,
    uploadFile: async () => { throw new Error("La carga de archivos todavía no está configurada. Insertá una URL https."); },
    pasteHandler: ({ event, defaultPasteHandler }) => {
      const value = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (isWebUrl(value) && !/\s/.test(value)) {
        setPendingUrl(value);
        return true;
      }
      return defaultPasteHandler();
    },
  });
  const [document, setDocument] = useState<RichLessonDocument>(() => serializeNote(editor.document));
  const latestRef = useRef({ title, type, document });
  latestRef.current = { title, type, document };
  const savedRef = useRef(JSON.stringify({ title: lessonTitle?.trim() ?? "", type: initialType ?? "doc", document: serializeNote(editor.document) }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const saveIdRef = useRef(0);
  const changedRef = useRef(false);
  const closeDialog = useCallback(() => {
    const dirty = changedRef.current;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Cerrar el editor?")) return;
    onClose();
  }, [onClose]);
  const dialogRef = useModalA11y<HTMLDivElement>(closeDialog, true, (event) => {
    if (pendingUrl) { event.preventDefault(); setPendingUrl(""); return true; }
    return Boolean(window.document.querySelector(".bn-suggestion-menu"));
  });

  const payload = useCallback((): LessonEditorPayload => {
    const current = latestRef.current;
    return { title: current.title.trim(), type: current.type, content: [], document: current.document };
  }, []);

  const scheduleSave = useCallback((next: LessonEditorPayload) => {
    if (mode !== "edit" || !onAutoSave || !next.title) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const id = ++saveIdRef.current;
      setStatus("Guardando...");
      queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
        if (id !== saveIdRef.current) return;
        await onAutoSave(next);
        savedRef.current = JSON.stringify({ title: next.title, type: next.type, document: next.document });
        changedRef.current = JSON.stringify({ title: latestRef.current.title.trim(), type: latestRef.current.type, document: latestRef.current.document }) !== savedRef.current;
        setStatus("✓ Guardado");
      }).catch(() => { setStatus("No se pudo guardar automáticamente"); });
    }, 1200);
  }, [mode, onAutoSave]);

  useEffect(() => {
    const current = payload();
    changedRef.current = JSON.stringify({ title: current.title, type: current.type, document: current.document }) !== savedRef.current;
    if (changedRef.current) scheduleSave(current);
  }, [title, type, document, payload, scheduleSave]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const save = async () => {
    if (!title.trim()) { setStatus("Escribí un título para la lección."); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    ++saveIdRef.current;
    setSaving(true);
    setStatus("Guardando...");
    try {
      await queueRef.current;
      const next = payload();
      await onSave(next);
      savedRef.current = JSON.stringify({ title: next.title, type: next.type, document: next.document });
      changedRef.current = false;
      setStatus("✓ Guardado");
    } catch {
      setStatus("No se pudo guardar. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const insertUrl = (kind: "link" | "mention" | "bookmark" | "video" | "file") => {
    const url = pendingUrl;
    if (!isWebUrl(url)) { setPendingUrl(""); return; }
    if (kind === "link") editor.insertInlineContent([{ type: "link", content: url, href: url }]);
    if (kind === "mention") editor.insertInlineContent([{ type: "link", content: `@${new URL(url).hostname}`, href: url }]);
    if (kind === "bookmark") {
      const block = editor.getTextCursorPosition().block;
      editor.insertBlocks([{ type: "bookmark", props: { url, title: new URL(url).hostname } }], block, "after");
    }
    if (kind === "file") {
      const block = editor.getTextCursorPosition().block;
      const rawName = new URL(url).pathname.split("/").pop() || "Archivo";
      let name = rawName;
      try { name = decodeURIComponent(rawName); } catch { /* keep the URL path */ }
      editor.insertBlocks([{ type: "file", props: { url, name } }], block, "after");
    }
    if (kind === "video") {
      const id = youtubeId(url);
      if (!id) { setStatus("Para insertar video, pegá una URL de YouTube válida."); return; }
      const block = editor.getTextCursorPosition().block;
      editor.insertBlocks([{ type: "youtube", props: { videoId: id } }], block, "after");
    }
    setPendingUrl("");
    editor.focus();
  };

  const handleSpaceShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " || event.ctrlKey || event.altKey || event.metaKey) return;
    const block = editor.getTextCursorPosition().block;
    if (block.type !== "paragraph" || !Array.isArray(block.content)) return;
    const text = block.content.map((item) => item.type === "text" ? item.text : "").join("");
    const level = { "/h1": 1, "/h2": 2, "/h3": 3 }[text as "/h1" | "/h2" | "/h3"];
    if (!level) return;
    event.preventDefault();
    editor.updateBlock(block, { type: "heading", props: { level }, content: [] });
    editor.setTextCursorPosition(block.id, "start");
  };

  return <div className="fixed inset-0 z-[300] flex items-center justify-center p-3" style={{ backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(4px)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-[#FAF8F5] shadow-2xl outline-none">
      <div className="flex items-center justify-between border-b-2 border-[#B58A43] bg-white px-6 py-4">
        <div><h2 id={titleId} className="text-xl text-[#173B6C]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{mode === "new" ? "Nueva lección" : "Editar lección"}</h2><p className="text-xs text-[#6c7b90]">{moduleName}</p></div>
        <div className="flex items-center gap-3"><button type="button" onClick={() => void save()} disabled={saving} className="rounded bg-[#B58A43] px-5 py-2 text-xs font-bold text-[#173B6C] disabled:opacity-50">{saving ? "GUARDANDO..." : "GUARDAR"}</button><button type="button" onClick={closeDialog} aria-label="Cerrar editor" className="text-2xl text-[#173B6C]">×</button></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e5ded2] px-6 py-3">
        <label htmlFor="rich-lesson-title" className="text-xs font-bold text-[#173B6C]">Título</label>
        <input id="rich-lesson-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Título de la lección" className="min-w-48 flex-1 rounded border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#173B6C] outline-[#B58A43]" />
        <label htmlFor="rich-lesson-type" className="text-xs font-bold text-[#173B6C]">Tipo</label>
        <select id="rich-lesson-type" value={type} onChange={(event) => setType(event.target.value as LessonType)} className="rounded border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#173B6C]"><option value="video">Video</option><option value="pdf">PDF</option><option value="ppt">PowerPoint</option><option value="doc">Documento</option></select>
      </div>
      <p className="px-6 py-2 text-xs text-[#6c7b90]">Enter crea el bloque siguiente · / abre comandos · seleccioná texto para negrita, cursiva, subrayado y colores · pegá una URL para insertarla.</p>
      {pendingUrl && <div role="dialog" aria-label="Opciones para la URL pegada" className="mx-6 mb-2 rounded-lg border border-[#B58A43] bg-white p-3 shadow-sm"><p className="mb-2 truncate text-xs text-[#173B6C]">{pendingUrl}</p><div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => insertUrl("link")} className="rounded bg-[#173B6C] px-3 py-1.5 text-xs text-white">URL</button>
        <button type="button" onClick={() => insertUrl("mention")} className="rounded border px-3 py-1.5 text-xs">Mencionar</button>
        <button type="button" onClick={() => insertUrl("bookmark")} className="rounded border px-3 py-1.5 text-xs">Marcador</button>
        {youtubeId(pendingUrl) && <button type="button" onClick={() => insertUrl("video")} className="rounded border px-3 py-1.5 text-xs">Insertar video</button>}
        <button type="button" onClick={() => insertUrl("file")} className="rounded border px-3 py-1.5 text-xs">Archivo externo</button>
        <button type="button" onClick={() => setPendingUrl("")} className="px-3 py-1.5 text-xs text-[#72132C]">Cancelar</button>
      </div></div>}
      <div className="lesson-rich-editor flex-1 overflow-y-auto px-5 py-4" onKeyDownCapture={handleSpaceShortcut}>
        <BlockNoteView editor={editor} theme="light" onChange={() => setDocument(serializeNote(editor.document))} />
      </div>
      <div className="border-t border-[#e5ded2] bg-white px-6 py-2 text-xs text-[#6c7b90]" role="status" aria-live="polite">{status || (mode === "edit" ? "Guardado automático activado" : "Guardá para crear la lección")}</div>
    </div>
  </div>;
}
