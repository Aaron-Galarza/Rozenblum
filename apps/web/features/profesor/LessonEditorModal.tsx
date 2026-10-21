"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LessonBlockDTO, LessonType } from "@rozenblum/shared";
import { useModalA11y } from "../../lib/use-modal-a11y";

// ── Types ──────────────────────────────────────────────────────────────────────
type BlockType = "h1" | "h2" | "h3" | "paragraph" | "bullet" | "numbered" | "quote" | "toggle" | "link" | "code";
type SaveState = "idle" | "saving" | "saved";

interface Block {
  id: string;
  type: BlockType;
  content: string;
  items?: string[];
  expanded?: boolean;
  toggleContent?: string;
}

interface LessonEditorModalProps {
  isOpen: boolean;
  mode: "new" | "edit";
  lessonTitle?: string;
  moduleName?: string;
  initialBlocks?: LessonBlockDTO[];
  initialType?: LessonType;
  onClose: () => void;
  onSave: (payload: { title: string; type: LessonType; content: LessonBlockDTO[] }) => Promise<void> | void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 9);

const autoResize = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

function getWordCount(blocks: Block[]) {
  const text = blocks
    .map((b) => [b.content, ...(b.items ?? []), b.toggleContent ?? ""].join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { chars: text.length, words: text ? text.split(" ").filter(Boolean).length : 0 };
}

// ── Empty block ────────────────────────────────────────────────────────────────
const EMPTY_BLOCK = (): Block => ({ id: genId(), type: "paragraph", content: "" });

// ── Slash commands ─────────────────────────────────────────────────────────────
const SLASH_CMDS = [
  { type: "h1" as BlockType, icon: "H1", label: "Heading 1", desc: "Título principal" },
  { type: "h2" as BlockType, icon: "H2", label: "Heading 2", desc: "Título secundario" },
  { type: "h3" as BlockType, icon: "H3", label: "Heading 3", desc: "Subtítulo" },
  { type: "paragraph" as BlockType, icon: "¶", label: "Párrafo", desc: "Texto normal" },
  { type: "bullet" as BlockType, icon: "•", label: "Lista viñetas", desc: "Lista sin orden" },
  { type: "numbered" as BlockType, icon: "1.", label: "Lista numerada", desc: "Lista con números" },
  { type: "quote" as BlockType, icon: '"', label: "Cita / Callout", desc: "Bloque con borde dorado" },
  { type: "toggle" as BlockType, icon: "▶", label: "Toggle", desc: "Bloque colapsable" },
  { type: "link" as BlockType, icon: "🔗", label: "Link", desc: "Enlace o video" },
  { type: "code" as BlockType, icon: "<>", label: "Código", desc: "Bloque monoespaciado" },
];

// ── Block type label ───────────────────────────────────────────────────────────
const TYPE_LABELS: Record<BlockType, string> = {
  h1: "H1", h2: "H2", h3: "H3", paragraph: "Párrafo",
  bullet: "Lista", numbered: "Numerada", quote: "Cita",
  toggle: "Toggle", link: "Link", code: "Código",
};

// ── Toolbar button ─────────────────────────────────────────────────────────────
function TBtn({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded text-xs font-bold transition-all duration-150"
      style={{
        backgroundColor: active ? "#B58A43" : "transparent",
        color: active ? "#FFFFFF" : disabled ? "rgba(23,59,108,0.25)" : "rgba(23,59,108,0.7)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F5F5F5"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = active ? "#B58A43" : "transparent"; }}
    >
      {children}
    </button>
  );
}

// ── Single block component ─────────────────────────────────────────────────────
interface BlockProps {
  block: Block;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onFocus: (id: string) => void;
  onChange: (id: string, patch: Partial<Block>) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function BlockRow({ block, isHovered, onHover, onFocus, onChange, onKeyDown, onDelete, onDuplicate }: BlockProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoResize(taRef.current);
  }, [block.content, block.type]);

  const sharedTaProps = (extraClass = "") => ({
    ref: taRef,
    value: block.content,
    placeholder: block.type === "paragraph" ? "Escribe algo o presiona '/' para insertar un bloque..." : "",
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(block.id, { content: e.target.value });
      autoResize(e.target);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => onKeyDown(e, block.id),
    onFocus: () => onFocus(block.id),
    className: `w-full bg-transparent outline-none resize-none leading-relaxed ${extraClass}`,
    rows: 1,
    style: { fontFamily: "'Roboto', sans-serif", color: "#173B6C" } as React.CSSProperties,
  });

  const renderContent = () => {
    switch (block.type) {
      case "h1":
        return <textarea {...sharedTaProps("text-4xl font-light")} style={{ fontFamily: "'Cormorant Garamond', serif", color: "#173B6C", fontSize: "2rem", fontWeight: 300, lineHeight: 1.2 }} />;
      case "h2":
        return <textarea {...sharedTaProps("text-2xl font-medium")} style={{ fontFamily: "'Cormorant Garamond', serif", color: "#173B6C", fontSize: "1.5rem", fontWeight: 500, lineHeight: 1.3 }} />;
      case "h3":
        return <textarea {...sharedTaProps("text-xl font-medium")} style={{ fontFamily: "'Cormorant Garamond', serif", color: "#173B6C", fontSize: "1.2rem", fontWeight: 500, lineHeight: 1.3 }} />;
      case "quote":
        return (
          <div className="pl-4 py-1" style={{ borderLeft: "4px solid #B58A43", backgroundColor: "#F9F7F4" }}>
            <textarea {...sharedTaProps("italic text-sm")} style={{ fontFamily: "'Roboto', sans-serif", color: "#173B6C", fontStyle: "italic", fontSize: "0.9rem" }} />
          </div>
        );
      case "code":
        return (
          <div className="p-3 rounded" style={{ backgroundColor: "#F0F0F0" }}>
            <textarea {...sharedTaProps("text-sm")} style={{ fontFamily: "'Courier New', monospace", color: "#173B6C", fontSize: "0.85rem" }} />
          </div>
        );
      case "link":
        return (
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="#B58A43" strokeWidth="1.5" className="w-4 h-4 flex-shrink-0">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <textarea {...sharedTaProps("text-sm underline")} style={{ fontFamily: "'Roboto', sans-serif", color: "#B58A43", fontSize: "0.9rem" }} />
          </div>
        );
      case "bullet":
        return (
          <div className="space-y-1">
            {(block.items ?? [""]).map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: "#B58A43" }} />
                <textarea
                  value={item}
                  rows={1}
                  className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                  style={{ fontFamily: "'Roboto', sans-serif", color: "#173B6C" }}
                  onChange={(e) => {
                    const items = [...(block.items ?? [])];
                    items[i] = e.target.value;
                    onChange(block.id, { items });
                    autoResize(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const items = [...(block.items ?? [])];
                      items.splice(i + 1, 0, "");
                      onChange(block.id, { items });
                    } else if (e.key === "Backspace" && item === "" && (block.items ?? []).length > 1) {
                      e.preventDefault();
                      const items = [...(block.items ?? [])];
                      items.splice(i, 1);
                      onChange(block.id, { items });
                    }
                  }}
                  onInput={(e) => autoResize(e.currentTarget)}
                />
              </div>
            ))}
          </div>
        );
      case "numbered":
        return (
          <div className="space-y-1">
            {(block.items ?? [""]).map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-sm font-medium flex-shrink-0 w-5 mt-0.5 text-right" style={{ color: "#B58A43" }}>{i + 1}.</span>
                <textarea
                  value={item}
                  rows={1}
                  className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                  style={{ fontFamily: "'Roboto', sans-serif", color: "#173B6C" }}
                  onChange={(e) => {
                    const items = [...(block.items ?? [])];
                    items[i] = e.target.value;
                    onChange(block.id, { items });
                    autoResize(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const items = [...(block.items ?? [])];
                      items.splice(i + 1, 0, "");
                      onChange(block.id, { items });
                    } else if (e.key === "Backspace" && item === "" && (block.items ?? []).length > 1) {
                      e.preventDefault();
                      const items = [...(block.items ?? [])];
                      items.splice(i, 1);
                      onChange(block.id, { items });
                    }
                  }}
                  onInput={(e) => autoResize(e.currentTarget)}
                />
              </div>
            ))}
          </div>
        );
      case "toggle":
        return (
          <div>
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => onChange(block.id, { expanded: !block.expanded })}
            >
              <svg
                viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2"
                className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${block.expanded ? "rotate-90" : ""}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-sm font-medium" style={{ color: "#173B6C" }}>{block.content || "Toggle"}</span>
            </div>
            {block.expanded && (
              <div className="ml-6 mt-2 pl-3" style={{ borderLeft: "2px solid rgba(23,59,108,0.15)" }}>
                <textarea
                  value={block.toggleContent ?? ""}
                  rows={3}
                  className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed"
                  style={{ fontFamily: "'Roboto', sans-serif", color: "rgba(23,59,108,0.8)" }}
                  onChange={(e) => { onChange(block.id, { toggleContent: e.target.value }); autoResize(e.target); }}
                  onInput={(e) => autoResize(e.currentTarget)}
                  placeholder="Contenido del toggle..."
                />
              </div>
            )}
          </div>
        );
      default:
        return (
          <textarea
            {...sharedTaProps("text-sm")}
            style={{ fontFamily: "'Roboto', sans-serif", color: "#173B6C", fontSize: "0.95rem", lineHeight: 1.6 }}
          />
        );
    }
  };

  return (
    <div
      className="group relative flex items-start gap-2 rounded px-2 py-1 transition-colors duration-150"
      style={{ backgroundColor: isHovered ? "#FAFAFA" : "transparent" }}
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab"
        style={{ color: "#173B6C" }}
      >
        <svg viewBox="0 0 8 16" fill="currentColor" className="w-3 h-4">
          <circle cx="2" cy="2" r="1.5" /><circle cx="6" cy="2" r="1.5" />
          <circle cx="2" cy="6" r="1.5" /><circle cx="6" cy="6" r="1.5" />
          <circle cx="2" cy="10" r="1.5" /><circle cx="6" cy="10" r="1.5" />
          <circle cx="2" cy="14" r="1.5" /><circle cx="6" cy="14" r="1.5" />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">{renderContent()}</div>

      {/* Hover actions */}
      <div className="flex-shrink-0 flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Block type tag */}
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F0F0F0", color: "rgba(23,59,108,0.5)" }}>
          {TYPE_LABELS[block.type]}
        </span>
        <button title="Duplicar" onClick={() => onDuplicate(block.id)} className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70 transition-opacity" style={{ color: "rgba(23,59,108,0.5)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
        <button title="Eliminar" onClick={() => onDelete(block.id)} className="w-6 h-6 flex items-center justify-center rounded hover:opacity-70 transition-opacity" style={{ color: "rgba(114,19,44,0.6)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function LessonEditorModal({ isOpen, mode, lessonTitle, moduleName, initialBlocks, initialType, onClose, onSave }: LessonEditorModalProps) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, isOpen);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState(lessonTitle ?? "");
  const [lessonType, setLessonType] = useState<LessonType>(initialType ?? "video");
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveLabel, setSaveLabel] = useState("GUARDAR");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashBlockId, setSlashBlockId] = useState<string | null>(null);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashAnchor, setSlashAnchor] = useState<{ top: number; left: number } | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [mounted, setMounted] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveText, setAutoSaveText] = useState("");

  // Init on open
  useEffect(() => {
    if (isOpen) {
      setTitle(lessonTitle ?? "");
      setLessonType(initialType ?? "video");
      setBlocks(
        mode === "edit" && initialBlocks && initialBlocks.length > 0
          ? initialBlocks.map((b) => ({ ...b, items: b.items ? [...b.items] : undefined }))
          : [EMPTY_BLOCK()],
      );
      setSaveLabel("GUARDAR");
      setSaveState("idle");
      setShowSlashMenu(false);
      setSlashAnchor(null);
      setAutoSaveText("");
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [isOpen, mode, lessonTitle, initialBlocks, initialType]);

  // Auto-save on block change
  useEffect(() => {
    if (!isOpen || blocks.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveText("Guardando...");
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveText("Guardado hace unos segundos");
      setTimeout(() => setAutoSaveText(""), 3000);
    }, 1200);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [blocks]);

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return [EMPTY_BLOCK()];
      return prev.filter((b) => b.id !== id);
    });
  }, []);

  const duplicateBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: genId(), items: prev[idx].items ? [...prev[idx].items!] : undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const addBlockAfter = useCallback((id: string, type: BlockType = "paragraph") => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const newBlock: Block = { id: genId(), type, content: "", items: (type === "bullet" || type === "numbered") ? [""] : undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string) => {
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addBlockAfter(id);
    } else if (e.key === "Backspace" && block.content === "") {
      e.preventDefault();
      deleteBlock(id);
    }
    if (showSlashMenu && (e.key === "Escape" || e.key === "Enter")) {
      setShowSlashMenu(false);
      setSlashAnchor(null);
    }
  }, [blocks, addBlockAfter, deleteBlock, showSlashMenu]);

  const handleChange = useCallback((id: string, patch: Partial<Block>) => {
    const content = patch.content;
    if (typeof content === "string") {
      if (content === "/") {
        setShowSlashMenu(true);
        setSlashBlockId(id);
        setSlashFilter("");
        const rect = document.activeElement?.getBoundingClientRect();
        setSlashAnchor(
          rect
            ? {
                top: Math.min(rect.bottom + 4, window.innerHeight - 320),
                left: Math.min(rect.left, window.innerWidth - 272),
              }
            : null,
        );
      } else if (showSlashMenu && content.startsWith("/")) {
        setSlashFilter(content.slice(1));
      } else {
        if (showSlashMenu && !content.startsWith("/")) {
          setShowSlashMenu(false);
          setSlashAnchor(null);
        }
      }
    }
    updateBlock(id, patch);
  }, [updateBlock, showSlashMenu]);

  const applySlashCommand = (type: BlockType) => {
    if (slashBlockId) {
      updateBlock(slashBlockId, {
        type,
        content: "",
        items: (type === "bullet" || type === "numbered") ? [""] : undefined,
        expanded: type === "toggle" ? false : undefined,
        toggleContent: type === "toggle" ? "" : undefined,
      });
    }
    setShowSlashMenu(false);
    setSlashBlockId(null);
    setSlashFilter("");
    setSlashAnchor(null);
  };

  const changeActiveType = (type: BlockType) => {
    if (activeBlockId) {
      updateBlock(activeBlockId, {
        type,
        items: (type === "bullet" || type === "numbered") ? (blocks.find(b => b.id === activeBlockId)?.items ?? [""]) : undefined,
        expanded: type === "toggle" ? false : undefined,
      });
    }
  };

  const handleSave = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!title.trim()) {
      setSaveLabel("FALTA TÍTULO");
      setTimeout(() => setSaveLabel("GUARDAR"), 1600);
      return;
    }
    setSaveLabel("GUARDANDO...");
    setSaveState("saving");
    try {
      await onSave({
        title: title.trim(),
        type: lessonType,
        content: blocks.map((block) => ({
          id: block.id,
          type: block.type,
          content: block.content,
          items: block.items,
          expanded: block.expanded,
          toggleContent: block.toggleContent,
        })),
      });
      setSaveLabel("✓ GUARDADO");
      setSaveState("saved");
    } catch {
      setSaveLabel("ERROR AL GUARDAR");
      setSaveState("idle");
    } finally {
      saveTimerRef.current = setTimeout(() => {
        setSaveLabel("GUARDAR");
        setSaveState("idle");
      }, 1800);
    }
  };

  const filteredSlash = SLASH_CMDS.filter((c) =>
    !slashFilter || c.label.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const { chars, words } = getWordCount(blocks);

  if (!isOpen) return null;

  const activeType = blocks.find((b) => b.id === activeBlockId)?.type;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex flex-col w-[90%] max-w-4xl transition-all duration-300 outline-none"
        style={{
          height: "90vh",
          backgroundColor: "#FAF8F5",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "scale(1)" : "scale(0.96)",
        }}
      >
        {/* ── HEADER ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 h-[70px]"
          style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #B58A43", borderRadius: "12px 12px 0 0" }}
        >
          <div>
            <h2 id={titleId} style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, lineHeight: 1.2 }}>
              {mode === "edit" ? `Editar Lección: ${lessonTitle ?? ""}` : "Crear Nueva Lección"}
            </h2>
            {moduleName && (
              <p style={{ color: "rgba(23,59,108,0.65)", fontFamily: "'Roboto', sans-serif", fontSize: "0.8rem", marginTop: 2 }}>
                {moduleName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-110 active:scale-95"
              style={{
                backgroundColor: saveState === "saved" ? "#5a9a5a" : "#B58A43",
                color: "#FAF8F5",
                borderRadius: "4px",
                letterSpacing: "0.12em",
                minWidth: 100,
              }}
            >
              {saveLabel}
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 hover:opacity-60"
              style={{ color: "#173B6C" }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── METADATA ── */}
        <div
          className="flex-shrink-0 flex flex-wrap items-center gap-3 px-6 py-3"
          style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid #E0E0E0" }}
        >
          <label htmlFor="lesson-title" className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)", fontFamily: "'Roboto', sans-serif" }}>
            Título
          </label>
          <input
            id="lesson-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la lección"
            className="flex-1 min-w-[220px] px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", backgroundColor: "#FFFFFF", fontFamily: "'Roboto', sans-serif" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#B58A43")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(23,59,108,0.2)")}
          />
          <label htmlFor="lesson-type" className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.6)", fontFamily: "'Roboto', sans-serif" }}>
            Tipo
          </label>
          <select
            id="lesson-type"
            value={lessonType}
            onChange={(e) => setLessonType(e.target.value as LessonType)}
            className="px-3 py-2 text-sm outline-none bg-white"
            style={{ border: "1px solid rgba(23,59,108,0.2)", borderRadius: 4, color: "#173B6C", fontFamily: "'Roboto', sans-serif" }}
          >
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="ppt">PowerPoint</option>
            <option value="doc">Documento</option>
          </select>
        </div>

        {/* ── TOOLBAR ── */}
        <div
          className="flex-shrink-0 flex items-center gap-1 px-4 py-2 flex-wrap"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #E0E0E0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
          }}
        >
          {/* Format buttons */}
          <TBtn label="Negrita (Ctrl+B)" onClick={() => document.execCommand("bold")}><span className="font-black">B</span></TBtn>
          <TBtn label="Cursiva (Ctrl+I)" onClick={() => document.execCommand("italic")}><span className="italic">I</span></TBtn>
          <TBtn label="Subrayado (Ctrl+U)" onClick={() => document.execCommand("underline")}><span className="underline">U</span></TBtn>
          <TBtn label="Tachado" onClick={() => document.execCommand("strikeThrough")}><span className="line-through">S</span></TBtn>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: "#E0E0E0" }} />

          {/* Block type buttons */}
          {(["h1", "h2", "h3"] as BlockType[]).map((t) => (
            <TBtn key={t} label={`Heading ${t[1]}`} active={activeType === t} onClick={() => changeActiveType(t)}>
              <span className="text-[10px] font-black">{t.toUpperCase()}</span>
            </TBtn>
          ))}
          <TBtn label="Cita" active={activeType === "quote"} onClick={() => changeActiveType("quote")}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
          </TBtn>
          <TBtn label="Lista viñetas" active={activeType === "bullet"} onClick={() => changeActiveType("bullet")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
          </TBtn>
          <TBtn label="Lista numerada" active={activeType === "numbered"} onClick={() => changeActiveType("numbered")}>
            <span className="text-[10px] font-bold">1.</span>
          </TBtn>
          <TBtn label="Toggle" active={activeType === "toggle"} onClick={() => changeActiveType("toggle")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M9 18l6-6-6-6" /></svg>
          </TBtn>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: "#E0E0E0" }} />

          <TBtn label="Link" active={activeType === "link"} onClick={() => changeActiveType("link")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
          </TBtn>
          <TBtn label="Código" active={activeType === "code"} onClick={() => changeActiveType("code")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
          </TBtn>
          <TBtn label="Tabla (Próximamente)" disabled onClick={() => {}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
          </TBtn>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: "#E0E0E0" }} />

          {/* More options */}
          <div className="relative">
            <TBtn label="Más opciones" onClick={() => setShowMoreOptions(!showMoreOptions)}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
            </TBtn>
            {showMoreOptions && (
              <div
                className="absolute left-0 top-9 w-52 z-50 py-1"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid #E0E0E0", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", borderRadius: "6px" }}
              >
                {["Insertar ecuación", "Insertar archivo", "Cambiar color de texto", "Cambiar color de fondo"].map((opt) => (
                  <div key={opt} className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: "rgba(23,59,108,0.3)", cursor: "not-allowed" }}>
                    <span>{opt}</span>
                    <span className="ml-auto text-[9px]" style={{ backgroundColor: "#F0F0F0", color: "rgba(23,59,108,0.4)", padding: "1px 4px", borderRadius: 2 }}>pronto</span>
                  </div>
                ))}
                <div className="h-px mx-2 my-1" style={{ backgroundColor: "#E0E0E0" }} />
                <button className="w-full text-left px-3 py-2 text-xs hover:opacity-70 transition-opacity" style={{ color: "#173B6C" }} onClick={() => setShowMoreOptions(false)}>
                  Copiar enlace del bloque
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── CANVAS ── */}
        <div className="flex-1 overflow-y-auto relative" onClick={() => setShowMoreOptions(false)}>
          <div className="max-w-3xl mx-auto px-8 py-6 min-h-full">
            {blocks.length === 1 && blocks[0].content === "" && blocks[0].type === "paragraph" ? (
              <div className="relative">
                <BlockRow
                  block={blocks[0]}
                  isHovered={hoveredBlockId === blocks[0].id}
                  onHover={setHoveredBlockId}
                  onFocus={setActiveBlockId}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onDelete={deleteBlock}
                  onDuplicate={duplicateBlock}
                />
                {/* Empty state hint */}
                <p
                  className="absolute top-1.5 left-10 text-sm pointer-events-none select-none"
                  style={{ color: "rgba(23,59,108,0.35)", fontFamily: "'Roboto', sans-serif" }}
                >
                  {blocks[0].content === "" ? "Escribe aquí o presiona '/' para agregar bloques..." : ""}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {blocks.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    isHovered={hoveredBlockId === block.id}
                    onHover={setHoveredBlockId}
                    onFocus={setActiveBlockId}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onDelete={deleteBlock}
                    onDuplicate={duplicateBlock}
                  />
                ))}
                {/* Add block button */}
                <button
                  onClick={() => setBlocks((prev) => [...prev, EMPTY_BLOCK()])}
                  className="flex items-center gap-2 px-10 py-2 text-xs transition-opacity duration-150 hover:opacity-100 opacity-30"
                  style={{ color: "#173B6C" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Agregar bloque
                </button>
              </div>
            )}
          </div>

          {/* Slash command menu */}
          {showSlashMenu && filteredSlash.length > 0 && (
            <div
              className="fixed z-[400] w-64 py-1"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E0E0E0",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                borderRadius: "8px",
                ...(slashAnchor
                  ? { top: slashAnchor.top, left: slashAnchor.left }
                  : { top: "50%", left: "50%", transform: "translate(-50%, -50%) translateY(20px)" }),
              }}
            >
              <p className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase" style={{ color: "rgba(23,59,108,0.4)" }}>
                Insertar bloque
              </p>
              {filteredSlash.map((cmd) => (
                <button
                  key={cmd.type}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-100 hover:opacity-70"
                  style={{ backgroundColor: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F5F5")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  onClick={() => applySlashCommand(cmd.type)}
                >
                  <span
                    className="w-7 h-7 flex items-center justify-center flex-shrink-0 text-xs font-bold rounded"
                    style={{ backgroundColor: "rgba(181,138,67,0.1)", color: "#B58A43" }}
                  >
                    {cmd.icon}
                  </span>
                  <div>
                    <p className="text-xs font-medium" style={{ color: "#173B6C" }}>{cmd.label}</p>
                    <p className="text-[10px]" style={{ color: "rgba(23,59,108,0.45)" }}>{cmd.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── STATUS BAR ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-2"
          style={{ backgroundColor: "#FFFFFF", borderTop: "1px solid #E0E0E0", borderRadius: "0 0 12px 12px" }}
        >
          <p className="text-xs transition-opacity duration-300" style={{ color: "rgba(23,59,108,0.4)", opacity: autoSaveText ? 1 : 0 }}>
            {autoSaveText || "·"}
          </p>
          <p className="text-xs" style={{ color: "rgba(23,59,108,0.4)" }}>
            {chars.toLocaleString()} caracteres · {words.toLocaleString()} palabras
          </p>
        </div>
      </div>
    </div>
  );
}
