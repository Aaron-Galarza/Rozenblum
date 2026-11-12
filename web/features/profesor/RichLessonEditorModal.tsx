"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BlockColorsItem, DragHandleMenu, RemoveBlockItem, SideMenu, SideMenuController, SuggestionMenuController, getDefaultReactSlashMenuItems, useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useExtensionState, type SideMenuProps } from "@blocknote/react";
import { filterSuggestionItems, SideMenuExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import { es } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";
import "@blocknote/mantine/style.css";
import type { LessonBlockDTO, LessonType, RichLessonDocument } from "@rozenblum/shared";
import { apiFetch } from "../../lib/api";
import { useModalA11y } from "../../lib/use-modal-a11y";
import { IconLink } from "../../components/icons";
import { lessonSchema, noteBlocks, serializeNote, youtubeId, type LessonNoteBlock, type LessonPartialBlock } from "../../lib/lesson-document";
import { canRetryEditorOperation, editorErrorMessage, newIdempotencyKey } from "../../lib/editor-operations";

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
  onSave: (payload: LessonEditorPayload, idempotencyKey?: string) => Promise<void> | void;
};

const isWebUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  }
  catch { return false; }
};
type YouTubePreview = { videoId: string; title: string; channel: string };
const hasContent = (doc: RichLessonDocument) => {
  const populated = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return false;
    const part = item as { type?: string; text?: string; content?: unknown[]; children?: unknown[] };
    if (["youtube", "bookmark", "file", "image"].includes(part.type ?? "")) return true;
    return Boolean(part.text?.trim()) || Boolean(part.content?.some(populated)) || Boolean(part.children?.some(populated));
  };
  return doc.blocks.some(populated);
};

function copyBlockWithoutIds(block: LessonNoteBlock): LessonPartialBlock {
  const { id: _id, children, ...rest } = block;
  return { ...rest, children: children.map(copyBlockWithoutIds) } as LessonPartialBlock;
}

function BlockAction({ action, children }: { action: "duplicate" | "paragraph" | "heading"; children: React.ReactNode }) {
  const editor = useBlockNoteEditor(lessonSchema);
  const Components = useComponentsContext()!;
  const hovered = useExtensionState(SideMenuExtension, { selector: (state) => state?.block });
  const block = hovered as LessonNoteBlock | undefined;
  if (!block || (block.type === "image" && action === "duplicate")) return null;
  return <Components.Generic.Menu.Item onClick={() => {
    if (action === "duplicate") {
      editor.insertBlocks([copyBlockWithoutIds(block)], block, "after");
    } else if (block.type !== "youtube" && block.type !== "bookmark" && block.type !== "image") {
      editor.updateBlock(block, action === "heading" ? { type: "heading", props: { level: 1 } } : { type: "paragraph" });
    }
  }}>{children}</Components.Generic.Menu.Item>;
}

const LessonDragMenu = () => <DragHandleMenu>
  <BlockAction action="duplicate">Duplicar</BlockAction>
  <BlockAction action="paragraph">Convertir en texto</BlockAction>
  <BlockAction action="heading">Convertir en título</BlockAction>
  <BlockColorsItem>Colores</BlockColorsItem>
  <RemoveBlockItem>Eliminar</RemoveBlockItem>
</DragHandleMenu>;
const LessonSideMenu = (props: SideMenuProps) => <SideMenu {...props} dragHandleMenu={LessonDragMenu} />;

export default function RichLessonEditorModal({ mode, lessonTitle, moduleName, initialBlocks, initialDocument, initialType, onClose, onSave }: Props) {
  const titleId = useId();
  const [title, setTitle] = useState(lessonTitle ?? "");
  const type: LessonType = initialType ?? "doc";
  const [pendingUrl, setPendingUrl] = useState("");
  const [urlMenuPosition, setUrlMenuPosition] = useState({ top: 180, left: 120 });
  const urlAnchorRef = useRef<string | null>(null);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [canRetrySave, setCanRetrySave] = useState(false);
  const [createRetryBlocked, setCreateRetryBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const createRequestIdRef = useRef<string | null>(null);
  const setFeedback = useCallback((message: string, isError = false) => {
    setStatus(message);
    setStatusIsError(isError);
  }, []);
  const initialContent = useMemo(() => noteBlocks(initialDocument, initialBlocks), [initialDocument, initialBlocks]);
  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent,
    dictionary: es,
    pasteHandler: ({ event, defaultPasteHandler }) => {
      const pastedFiles = Array.from(event.clipboardData?.files ?? []);
      if (pastedFiles.length) {
        setFeedback("La carga de imágenes y archivos está pausada hasta definir el almacenamiento.", true);
        return true;
      }
      const value = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (isWebUrl(value) && !/\s/.test(value)) {
        urlAnchorRef.current = editor.getTextCursorPosition().block.id;
        const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
        if (rect) setUrlMenuPosition({ top: Math.min(window.innerHeight - 230, rect.bottom + 12), left: Math.max(12, Math.min(window.innerWidth - 320, rect.left)) });
        setPendingUrl(value);
        return true;
      }
      if (/<img\b/i.test(event.clipboardData?.getData("text/html") ?? "")) {
        setFeedback("La inserción de imágenes está pausada hasta definir el almacenamiento.", true);
        return true;
      }
      return defaultPasteHandler();
    },
  });
  const [, renderChange] = useState(0);
  const titleRef = useRef(title);
  titleRef.current = title;
  const getSnapshot = useCallback(() => JSON.stringify({
    title: titleRef.current.trim(),
    type,
    document: serializeNote(editor.document),
    pendingUrl,
  }), [editor, pendingUrl, type]);
  const savedRef = useRef(getSnapshot());
  const savingRef = useRef(false);
  const initiallyHadContent = useRef(hasContent(serializeNote(editor.document)));
  const dirty = getSnapshot() !== savedRef.current;
  const closeDialog = useCallback(() => {
    if (savingRef.current) {
      setFeedback("Esperá a que termine el guardado antes de cerrar.", true);
      return;
    }
    if (createRetryBlocked) {
      setFeedback("La creación pudo haberse completado. Verificá su resultado antes de cerrar o volver a crear.", true);
      return;
    }
    if (getSnapshot() !== savedRef.current && !window.confirm("Hay cambios sin guardar. Si cerrás el editor, se descartarán. ¿Cerrar igualmente?")) return;
    onClose();
  }, [createRetryBlocked, getSnapshot, onClose, setFeedback]);
  const dialogRef = useModalA11y<HTMLDivElement>(closeDialog, true, (event) => {
    if (pendingUrl) { event.preventDefault(); setPendingUrl(""); return true; }
    return Boolean(window.document.querySelector(".bn-suggestion-menu"));
  });

  const payload = useCallback((): LessonEditorPayload => {
    return { title: titleRef.current.trim(), type, content: initialBlocks ?? [], document: serializeNote(editor.document) };
  }, [editor, initialBlocks, type]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (getSnapshot() === savedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [getSnapshot]);

  const save = async (verifiedCreateRetry = false) => {
    if (savingRef.current) return;
    if (createRetryBlocked && !verifiedCreateRetry) return;
    if (pendingUrl) { setFeedback("Elegí cómo insertar la URL o cancelala antes de guardar.", true); return; }
    const next = payload();
    if (!next.title) { setFeedback("Escribí un título para la lección.", true); return; }
    if (initiallyHadContent.current && !hasContent(next.document) && !window.confirm("Esta lección quedará vacía. ¿Querés borrar todo su contenido?")) return;
    const idempotencyKey = mode === "new" ? (createRequestIdRef.current ??= newIdempotencyKey()) : undefined;
    savingRef.current = true;
    setSaving(true);
    setCanRetrySave(false);
    setFeedback("Guardando lección…");
    try {
      await onSave(next, idempotencyKey);
      savedRef.current = getSnapshot();
      setFeedback("✓ Lección guardada.");
    } catch (error) {
      setFeedback(editorErrorMessage(error, { creationMayHaveSucceeded: mode === "new" }), true);
      setCanRetrySave(mode === "edit" && canRetryEditorOperation(error));
      const uncertainCreate = mode === "new" && canRetryEditorOperation(error);
      setCreateRetryBlocked(uncertainCreate);
      if (mode === "new" && !uncertainCreate) createRequestIdRef.current = null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const insertUrl = async (kind: "link" | "mention" | "bookmark" | "video" | "file") => {
    const url = pendingUrl;
    if (!isWebUrl(url)) { setPendingUrl(""); return; }
    let preview: YouTubePreview | null = null;
    const id = youtubeId(url);
    if (kind === "video" && !id) { setFeedback("Para insertar video, pegá una URL de YouTube válida.", true); return; }
    if (id && ["mention", "bookmark", "video"].includes(kind)) {
      setFetchingPreview(true);
       setFeedback("Obteniendo información del video…");
      try { preview = await apiFetch<YouTubePreview>(`/api/teacher/youtube-preview?url=${encodeURIComponent(url)}`, { auth: true }); }
      catch (error) { setFeedback(editorErrorMessage(error), true); setFetchingPreview(false); return; }
      setFetchingPreview(false);
    }
    const anchor = urlAnchorRef.current ? editor.getBlock(urlAnchorRef.current) : undefined;
    editor.focus();
    if (kind === "link") editor.insertInlineContent([{ type: "link", content: url, href: url }]);
    if (kind === "mention") editor.insertInlineContent([{ type: "link", content: preview ? `${preview.title} · ${preview.channel}` : `@${new URL(url).hostname}`, href: url }]);
    if (kind === "bookmark") {
      editor.insertBlocks([{ type: "bookmark", props: { url, title: preview?.title ?? new URL(url).hostname, channel: preview?.channel ?? "", videoId: preview?.videoId ?? "" } }], anchor ?? editor.getTextCursorPosition().block, "after");
    }
    if (kind === "file") {
      const rawName = new URL(url).pathname.split("/").pop() || "Archivo";
      let name = rawName;
      try { name = decodeURIComponent(rawName); } catch { /* keep the URL path */ }
      editor.insertBlocks([{ type: "file", props: { url, name } }], anchor ?? editor.getTextCursorPosition().block, "after");
    }
    if (kind === "video") {
      editor.insertBlocks([{ type: "youtube", props: { videoId: id!, title: preview?.title ?? "", channel: preview?.channel ?? "" } }], anchor ?? editor.getTextCursorPosition().block, "after");
    }
    setPendingUrl("");
    urlAnchorRef.current = null;
    setFeedback(kind === "file" ? "Archivo enlazado. Guardá la lección para conservar el cambio." : "Contenido insertado. Guardá la lección para conservar el cambio.");
    setCanRetrySave(false);
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

  const changeBlock = (kind: "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "quote" | "toggleListItem" | "codeBlock", level = 1) => {
    const block = editor.getTextCursorPosition().block;
    if (block.type === "youtube" || block.type === "bookmark") return;
    editor.updateBlock(block, kind === "heading" ? { type: kind, props: { level: level as 1 | 2 | 3 } } : { type: kind });
    editor.focus();
  };

  const toolbarButton = (label: string, onClick: () => void, title?: string) => <button type="button" title={title ?? label} aria-label={title ?? label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="min-h-10 min-w-10 rounded px-2 py-1 text-xs font-semibold text-[#173B6C] hover:bg-[#eee7dc] focus-visible:outline-2 focus-visible:outline-[#B58A43]">{label}</button>;

  return <div className="fixed inset-0 z-[300] flex items-center justify-center p-2 sm:p-3" style={{ backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(4px)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-[92dvh] min-h-0 w-full max-w-4xl flex-col rounded-lg bg-[#FAF8F5] shadow-2xl outline-none sm:rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#B58A43] bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0"><h2 id={titleId} className="text-xl text-[#173B6C]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{mode === "new" ? "Nueva lección" : "Editar lección"}</h2><p className="truncate text-xs text-[#6c7b90]">{moduleName}</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => void save()} disabled={saving || createRetryBlocked} className="min-h-11 rounded bg-[#B58A43] px-4 py-2 text-xs font-bold text-[#173B6C] disabled:opacity-50 sm:px-5">{saving ? "GUARDANDO…" : "GUARDAR"}</button><button type="button" onClick={closeDialog} disabled={saving} aria-label="Cerrar editor" className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-[#173B6C] disabled:opacity-50">×</button></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e5ded2] px-4 py-3 sm:px-6">
        <label htmlFor="rich-lesson-title" className="text-xs font-bold text-[#173B6C]">Título</label>
        <input id="rich-lesson-title" value={title} disabled={saving || createRetryBlocked} onChange={(event) => { setTitle(event.target.value); setFeedback(""); setCanRetrySave(false); }} maxLength={180} placeholder="Título de la lección" className="min-h-11 min-w-0 flex-1 rounded border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#173B6C] outline-[#B58A43] disabled:opacity-60" />
      </div>
      <div role="toolbar" aria-label="Formato e inserción" inert={saving || createRetryBlocked} className="lesson-top-toolbar flex flex-wrap items-center gap-1 border-b border-[#e5ded2] bg-white px-3 py-2 sm:px-5">
        {toolbarButton("Texto", () => changeBlock("paragraph"))}
        {toolbarButton("H1", () => changeBlock("heading", 1), "Título principal")}
        {toolbarButton("H2", () => changeBlock("heading", 2), "Título secundario")}
        {toolbarButton("H3", () => changeBlock("heading", 3), "Subtítulo")}
        {toolbarButton("• Lista", () => changeBlock("bulletListItem"))}
        {toolbarButton("1. Lista", () => changeBlock("numberedListItem"))}
        {toolbarButton("Cita", () => changeBlock("quote"))}
        {toolbarButton("▸ Toggle", () => changeBlock("toggleListItem"), "Bloque desplegable")}
        {toolbarButton("</> Código", () => changeBlock("codeBlock"), "Código")}
        <button type="button" title="Insertar enlace" aria-label="Insertar enlace" onMouseDown={(event) => event.preventDefault()} onClick={() => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); }} className="flex min-h-10 min-w-10 items-center justify-center rounded px-2 py-1 text-xs font-semibold text-[#173B6C] hover:bg-[#eee7dc] focus-visible:outline-2 focus-visible:outline-[#B58A43]"><IconLink className="h-4 w-4" /></button>
        <span aria-hidden="true" className="mx-1 h-5 border-l border-[#d8c6aa]" />
        {toolbarButton("B", () => editor.toggleStyles({ bold: true }), "Negrita")}
        {toolbarButton("I", () => editor.toggleStyles({ italic: true }), "Cursiva")}
        {toolbarButton("U", () => editor.toggleStyles({ underline: true }), "Subrayado")}
        {toolbarButton("S", () => editor.toggleStyles({ strike: true }), "Tachado")}
      </div>
      <p className="px-4 py-2 text-xs leading-relaxed text-[#6c7b90] sm:px-6">Enter crea un bloque · / muestra todos los bloques · + añade debajo · ⋮⋮ permite mover y editar el bloque · pegá una URL para elegir cómo insertarla. La carga de imágenes está pausada.</p>
      {pendingUrl && !saving && <div role="dialog" aria-label="Opciones para la URL pegada" className="fixed z-[450] w-[min(320px,calc(100vw-24px))] rounded-lg border border-[#B58A43] bg-white p-3 shadow-xl" style={{ top: Math.max(12, urlMenuPosition.top), left: urlMenuPosition.left }}><input autoFocus aria-label="URL para insertar" value={pendingUrl} onChange={(event) => setPendingUrl(event.target.value)} className="mb-2 w-full rounded border border-[#e5ded2] px-2 py-1 text-xs text-[#173B6C]" /><div className="flex flex-wrap gap-2">
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("link")} className="min-h-10 rounded bg-[#173B6C] px-3 py-1.5 text-xs text-white disabled:opacity-50">URL</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("mention")} className="min-h-10 rounded border px-3 py-1.5 text-xs disabled:opacity-50">Mencionar</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("bookmark")} className="min-h-10 rounded border px-3 py-1.5 text-xs disabled:opacity-50">Marcador</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("video")} className="min-h-10 rounded border px-3 py-1.5 text-xs disabled:opacity-50">Insertar video</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("file")} className="min-h-10 rounded border px-3 py-1.5 text-xs disabled:opacity-50">Archivo externo</button>
        <button type="button" disabled={fetchingPreview} onClick={() => setPendingUrl("")} className="min-h-10 px-3 py-1.5 text-xs text-[#72132C] disabled:opacity-50">Cancelar</button>
      </div></div>}
      <div className="lesson-rich-editor min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4" onKeyDownCapture={handleSpaceShortcut} onDropCapture={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); setFeedback("La carga de imágenes y archivos está pausada hasta definir el almacenamiento.", true); } }}>
        <BlockNoteView editor={editor} editable={!saving && !createRetryBlocked} theme="light" sideMenu={false} slashMenu={false} onChange={() => { setFeedback(""); setCanRetrySave(false); renderChange((value) => value + 1); }}>
          <SideMenuController sideMenu={LessonSideMenu} />
          <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems([
            ...getDefaultReactSlashMenuItems(editor).filter((item) => !["Video", "Audio", "File", "Image", es.slash_menu.image.title, es.slash_menu.video.title, es.slash_menu.audio.title, es.slash_menu.file.title].includes(item.title)),
            { title: "Video de YouTube", subtext: "Insertar video no listado", group: "Multimedia", aliases: ["youtube", "video"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
            { title: "Marcador web", subtext: "Insertar enlace como tarjeta", group: "Multimedia", aliases: ["bookmark", "enlace"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
            { title: "Archivo externo", subtext: "Enlazar PDF o documento por URL", group: "Multimedia", aliases: ["pdf", "documento", "powerpoint"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
          ], query)} />
        </BlockNoteView>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5ded2] bg-white px-4 py-2 text-xs text-[#6c7b90] sm:px-6" role={statusIsError ? "alert" : "status"} aria-live={statusIsError ? "assertive" : "polite"}>
        <span>{status || (dirty ? "Hay cambios sin guardar. Solo se aplican al pulsar GUARDAR." : mode === "edit" ? "Sin cambios pendientes." : "Guardá para crear la lección.")}</span>
        {canRetrySave && <button type="button" onClick={() => void save()} disabled={saving} className="min-h-10 px-3 font-semibold text-[#173B6C] underline underline-offset-2 disabled:opacity-50">Reintentar guardado</button>}
        {createRetryBlocked && <button type="button" onClick={() => { if (!window.confirm("Verificá en el curso que esta lección ya aparece guardada. ¿Confirmás que se creó y querés cerrar sin volver a enviarla?")) return; savedRef.current = getSnapshot(); setCreateRetryBlocked(false); onClose(); }} disabled={saving} className="min-h-10 px-3 font-semibold text-[#173B6C] underline underline-offset-2 disabled:opacity-50">Ya aparece; cerrar</button>}
        {createRetryBlocked && <button type="button" onClick={() => { if (!window.confirm("Revisá el curso en otra pestaña y confirmá que esta lección no se creó. ¿Querés volver a enviar la creación?")) return; setCreateRetryBlocked(false); void save(true); }} disabled={saving} className="min-h-10 px-3 font-semibold text-[#173B6C] underline underline-offset-2 disabled:opacity-50">Verifiqué que no se creó; reintentar</button>}
      </div>
    </div>
  </div>;
}
