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
import { apiFetch, errorMessage, uploadGalleryImage } from "../../lib/api";
import { useModalA11y } from "../../lib/use-modal-a11y";
import ImagePicker from "../../components/ui/ImagePicker";
import { lessonSchema, noteBlocks, serializeNote, youtubeId, type LessonNoteBlock, type LessonPartialBlock } from "../../lib/lesson-document";

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
};

const isWebUrl = (value: string) => {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
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
  if (!block) return null;
  return <Components.Generic.Menu.Item onClick={() => {
    if (action === "duplicate") {
      editor.insertBlocks([copyBlockWithoutIds(block)], block, "after");
    } else if (block.type !== "youtube" && block.type !== "bookmark") {
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
  const [saving, setSaving] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imageUploads, setImageUploads] = useState(0);
  const imageUploadsRef = useRef(0);
  const changeImageUploads = (delta: number) => {
    imageUploadsRef.current = Math.max(0, imageUploadsRef.current + delta);
    setImageUploads(imageUploadsRef.current);
  };
  const initialContent = useMemo(() => noteBlocks(initialDocument, initialBlocks), []);
  const editor = useCreateBlockNote({
    schema: lessonSchema,
    initialContent,
    dictionary: es,
    pasteHandler: ({ event, defaultPasteHandler }) => {
      const pastedImage = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
      if (pastedImage) {
        changeImageUploads(1);
        setStatus("Subiendo imagen a Cloudinary…");
        void uploadGalleryImage("lessons", pastedImage)
          .then((image) => {
            editor.insertBlocks([{ type: "image", props: { url: image.url } }], editor.getTextCursorPosition().block, "after");
            setStatus("Imagen insertada. Guardá la lección para conservarla.");
          })
          .catch((cause) => setStatus(errorMessage(cause)))
          .finally(() => changeImageUploads(-1));
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
        setStatus("Para insertar imágenes externas, subilas con el botón Imagen.");
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
    if (savingRef.current || imageUploadsRef.current > 0) {
      setStatus("Esperá a que termine la subida de la imagen antes de cerrar.");
      return;
    }
    if (getSnapshot() !== savedRef.current && !window.confirm("Hay cambios sin guardar. Si cerrás el editor, se descartarán. ¿Cerrar igualmente?")) return;
    onClose();
  }, [getSnapshot, onClose]);
  const dialogRef = useModalA11y<HTMLDivElement>(closeDialog, true, (event) => {
    if (pendingUrl) { event.preventDefault(); setPendingUrl(""); return true; }
    return Boolean(window.document.querySelector(".bn-suggestion-menu"));
  });

  const payload = useCallback((): LessonEditorPayload => {
    return { title: titleRef.current.trim(), type, content: initialBlocks ?? [], document: serializeNote(editor.document) };
  }, [editor, initialBlocks, type]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (getSnapshot() === savedRef.current && imageUploadsRef.current === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [getSnapshot]);

  const save = async () => {
    if (savingRef.current) return;
    if (imageUploadsRef.current > 0) { setStatus("Esperá a que termine la subida antes de guardar."); return; }
    if (pendingUrl) { setStatus("Elegí cómo insertar la URL o cancelala antes de guardar."); return; }
    const next = payload();
    if (!next.title) { setStatus("Escribí un título para la lección."); return; }
    if (initiallyHadContent.current && !hasContent(next.document) && !window.confirm("Esta lección quedará vacía. ¿Querés borrar todo su contenido?")) return;
    savingRef.current = true;
    setSaving(true);
    setStatus("Guardando...");
    try {
      await onSave(next);
      savedRef.current = getSnapshot();
      setStatus("✓ Guardado");
    } catch {
      setStatus("No se pudo guardar. Intentá de nuevo.");
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
    if (kind === "video" && !id) { setStatus("Para insertar video, pegá una URL de YouTube válida."); return; }
    if (id && ["mention", "bookmark", "video"].includes(kind)) {
      setFetchingPreview(true);
      setStatus("Obteniendo información del video...");
      try { preview = await apiFetch<YouTubePreview>(`/api/teacher/youtube-preview?url=${encodeURIComponent(url)}`, { auth: true }); }
      catch (error) { setStatus(errorMessage(error)); setFetchingPreview(false); return; }
      setFetchingPreview(false);
    }
    const anchor = urlAnchorRef.current ? editor.getBlock(urlAnchorRef.current) : undefined;
    editor.focus();
    if (kind === "link") editor.insertInlineContent([{ type: "link", content: url, href: url }]);
    if (kind === "mention") editor.insertInlineContent([{ type: "link", content: preview ? `▶ ${preview.title} · ${preview.channel}` : `@${new URL(url).hostname}`, href: url }]);
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

  const toolbarButton = (label: string, onClick: () => void, title?: string) => <button type="button" title={title ?? label} aria-label={title ?? label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="rounded px-2 py-1 text-xs font-semibold text-[#173B6C] hover:bg-[#eee7dc] focus-visible:outline-2 focus-visible:outline-[#B58A43]">{label}</button>;

  return <div className="fixed inset-0 z-[300] flex items-center justify-center p-3" style={{ backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(4px)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-[#FAF8F5] shadow-2xl outline-none">
      <div className="flex items-center justify-between border-b-2 border-[#B58A43] bg-white px-6 py-4">
        <div><h2 id={titleId} className="text-xl text-[#173B6C]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{mode === "new" ? "Nueva lección" : "Editar lección"}</h2><p className="text-xs text-[#6c7b90]">{moduleName}</p></div>
        <div className="flex items-center gap-3"><button type="button" onClick={() => void save()} disabled={saving || imageUploads > 0} className="rounded bg-[#B58A43] px-5 py-2 text-xs font-bold text-[#173B6C] disabled:opacity-50">{saving ? "GUARDANDO..." : imageUploads > 0 ? "SUBIENDO…" : "GUARDAR"}</button><button type="button" onClick={closeDialog} disabled={saving || imageUploads > 0} aria-label="Cerrar editor" className="text-2xl text-[#173B6C] disabled:opacity-50">×</button></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e5ded2] px-6 py-3">
        <label htmlFor="rich-lesson-title" className="text-xs font-bold text-[#173B6C]">Título</label>
        <input id="rich-lesson-title" value={title} disabled={saving} onChange={(event) => { setTitle(event.target.value); setStatus(""); }} maxLength={180} placeholder="Título de la lección" className="min-w-48 flex-1 rounded border border-[#d6d6d6] bg-white px-3 py-2 text-sm text-[#173B6C] outline-[#B58A43]" />
      </div>
      <div role="toolbar" aria-label="Formato e inserción" inert={saving} className="lesson-top-toolbar flex flex-wrap items-center gap-1 border-b border-[#e5ded2] bg-white px-5 py-2">
        {toolbarButton("Texto", () => changeBlock("paragraph"))}
        {toolbarButton("H1", () => changeBlock("heading", 1), "Título principal")}
        {toolbarButton("H2", () => changeBlock("heading", 2), "Título secundario")}
        {toolbarButton("H3", () => changeBlock("heading", 3), "Subtítulo")}
        {toolbarButton("• Lista", () => changeBlock("bulletListItem"))}
        {toolbarButton("1. Lista", () => changeBlock("numberedListItem"))}
        {toolbarButton("Cita", () => changeBlock("quote"))}
        {toolbarButton("▸ Toggle", () => changeBlock("toggleListItem"), "Bloque desplegable")}
        {toolbarButton("</> Código", () => changeBlock("codeBlock"), "Código")}
        {toolbarButton("🔗", () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); }, "Insertar enlace")}
        {toolbarButton("Imagen", () => setImagePickerOpen((current) => !current), "Insertar imagen de Cloudinary")}
        <span aria-hidden="true" className="mx-1 h-5 border-l border-[#d8c6aa]" />
        {toolbarButton("B", () => editor.toggleStyles({ bold: true }), "Negrita")}
        {toolbarButton("I", () => editor.toggleStyles({ italic: true }), "Cursiva")}
        {toolbarButton("U", () => editor.toggleStyles({ underline: true }), "Subrayado")}
        {toolbarButton("S", () => editor.toggleStyles({ strike: true }), "Tachado")}
      </div>
      {imagePickerOpen && <div className="max-h-[40vh] overflow-y-auto border-b border-[#e5ded2] bg-white px-6 py-3"><ImagePicker category="lessons" label="Imagen de la lección" value="" onUploadStateChange={(busy) => changeImageUploads(busy ? 1 : -1)} onChange={(url) => { editor.insertBlocks([{ type: "image", props: { url } }], editor.getTextCursorPosition().block, "after"); setImagePickerOpen(false); setStatus("Imagen insertada. Guardá la lección para conservarla."); }} /></div>}
      <p className="px-6 py-2 text-xs text-[#6c7b90]">Enter crea un bloque · / muestra todos los bloques · + añade debajo · ⋮⋮ permite mover y editar el bloque · pegá una URL para elegir cómo insertarla.</p>
      {pendingUrl && !saving && <div role="dialog" aria-label="Opciones para la URL pegada" className="fixed z-[450] w-[min(320px,calc(100vw-24px))] rounded-lg border border-[#B58A43] bg-white p-3 shadow-xl" style={{ top: Math.max(12, urlMenuPosition.top), left: urlMenuPosition.left }}><input autoFocus aria-label="URL para insertar" value={pendingUrl} onChange={(event) => setPendingUrl(event.target.value)} className="mb-2 w-full rounded border border-[#e5ded2] px-2 py-1 text-xs text-[#173B6C]" /><div className="flex flex-wrap gap-2">
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("link")} className="rounded bg-[#173B6C] px-3 py-1.5 text-xs text-white">URL</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("mention")} className="rounded border px-3 py-1.5 text-xs">Mencionar</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("bookmark")} className="rounded border px-3 py-1.5 text-xs">Marcador</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("video")} className="rounded border px-3 py-1.5 text-xs">Insertar video</button>
        <button type="button" disabled={fetchingPreview} onClick={() => void insertUrl("file")} className="rounded border px-3 py-1.5 text-xs">Archivo externo</button>
        <button type="button" onClick={() => setPendingUrl("")} className="px-3 py-1.5 text-xs text-[#72132C]">Cancelar</button>
      </div></div>}
      <div className="lesson-rich-editor min-h-0 flex-1 px-5 py-4" onKeyDownCapture={handleSpaceShortcut} onDropCapture={(event) => { const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); event.stopPropagation(); changeImageUploads(1); setStatus("Subiendo imagen a Cloudinary…"); void uploadGalleryImage("lessons", file).then((image) => { editor.insertBlocks([{ type: "image", props: { url: image.url } }], editor.getTextCursorPosition().block, "after"); setStatus("Imagen insertada. Guardá la lección para conservarla."); }).catch((cause) => setStatus(errorMessage(cause))).finally(() => changeImageUploads(-1)); } }}>
        <BlockNoteView editor={editor} editable={!saving} theme="light" sideMenu={false} slashMenu={false} onChange={() => { setStatus(""); renderChange((value) => value + 1); }}>
          <SideMenuController sideMenu={LessonSideMenu} />
          <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems([
            ...getDefaultReactSlashMenuItems(editor).filter((item) => !["Video", "Audio", "File", "Image", es.slash_menu.image.title, es.slash_menu.video.title, es.slash_menu.audio.title, es.slash_menu.file.title].includes(item.title)),
            { title: "Imagen", subtext: "Elegir o subir a Cloudinary", group: "Multimedia", aliases: ["foto", "imagen"], onItemClick: () => setImagePickerOpen(true) },
            { title: "Video de YouTube", subtext: "Insertar video no listado", group: "Multimedia", aliases: ["youtube", "video"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
            { title: "Marcador web", subtext: "Insertar enlace como tarjeta", group: "Multimedia", aliases: ["bookmark", "enlace"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
            { title: "Archivo externo", subtext: "Enlazar PDF o documento por URL", group: "Multimedia", aliases: ["pdf", "documento", "powerpoint"], onItemClick: () => { urlAnchorRef.current = editor.getTextCursorPosition().block.id; setPendingUrl("https://"); setUrlMenuPosition({ top: 200, left: Math.max(12, window.innerWidth / 2 - 160) }); } },
          ], query)} />
        </BlockNoteView>
      </div>
      <div className="border-t border-[#e5ded2] bg-white px-6 py-2 text-xs text-[#6c7b90]" role="status" aria-live="polite">{status || (dirty ? "Hay cambios sin guardar. Solo se aplican al pulsar GUARDAR." : mode === "edit" ? "Sin cambios pendientes." : "Guardá para crear la lección.")}</div>
    </div>
  </div>;
}
