"use client";

import { BlockNoteSchema, defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import type { LessonBlockDTO, RichLessonDocument } from "@rozenblum/shared";
import { safeHttpUrl } from "./safe-url";

export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") id = url.pathname.slice(1);
    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      id = url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

const YouTubeBlock = createReactBlockSpec(
  {
    type: "youtube",
    propSchema: { videoId: { default: "" }, title: { default: "" }, channel: { default: "" } },
    content: "none",
  },
  {
    render: ({ block }) => {
      const id = block.props.videoId;
      return <div contentEditable={false} className="my-3 w-full min-w-0 overflow-hidden rounded-lg bg-slate-900">
        {/^[A-Za-z0-9_-]{11}$/.test(id)
          ? <div className="aspect-video w-full"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}`} title={block.props.title || "Video de YouTube"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" /></div>
          : <p className="p-5 text-white">Video inválido</p>}
        {block.props.title && <div className="px-4 py-3 text-sm text-white"><p className="font-semibold">{block.props.title}</p>{block.props.channel && <p className="text-xs text-slate-300">{block.props.channel}</p>}</div>}
      </div>;
    },
  },
);

const BookmarkBlock = createReactBlockSpec(
  { type: "bookmark", propSchema: { url: { default: "" }, title: { default: "" }, channel: { default: "" }, videoId: { default: "" } }, content: "none" },
  { render: ({ block }) => {
    const { url, title } = block.props;
    const safe = safeHttpUrl(url);
    return <div contentEditable={false} className="my-3 w-full min-w-0 overflow-hidden rounded-lg border border-[#d8c6aa] bg-white">
      {safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-col gap-4 p-3 text-[#173B6C] no-underline hover:bg-[#faf8f5] sm:flex-row">
        {/^[A-Za-z0-9_-]{11}$/.test(block.props.videoId) && <img src={`https://i.ytimg.com/vi/${block.props.videoId}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full shrink-0 rounded object-cover sm:w-44" />}
        <span className="min-w-0 self-center"><strong className="block break-words text-sm leading-snug">{title || url}</strong>{block.props.channel && <span className="mt-1 block text-xs text-[#64748b]">{block.props.channel}</span>}<span className="mt-2 block break-all text-[11px] text-[#7a8493]">{url}</span></span>
      </a> : <span className="block p-4">Enlace inválido</span>}
    </div>;
  } },
);

function ExternalFileCard({ url, name, caption }: { url: string; name: string; caption?: string }) {
  const safe = safeHttpUrl(url);
  const pdf = name.toLowerCase().endsWith(".pdf") || Boolean(safe && new URL(safe).pathname.toLowerCase().endsWith(".pdf"));
  const sameOrigin = Boolean(safe && typeof window !== "undefined" && new URL(safe).origin === window.location.origin);
  return <div className="my-3 w-full min-w-0 overflow-hidden rounded-lg border border-[#d8c6aa] bg-white">
    {safe ? <a href={safe} target={sameOrigin ? undefined : "_blank"} rel={sameOrigin ? undefined : "noopener noreferrer"} download={sameOrigin ? name || true : undefined} className="flex min-h-16 min-w-0 items-center gap-3 p-4 text-[#173B6C] no-underline transition-colors hover:bg-[#faf8f5]">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#f4ead8] text-xs font-bold text-[#9A7435]">{pdf ? "PDF" : "↗"}</span>
      <span className="min-w-0 flex-1"><strong className="block break-words text-sm leading-snug">{name || "Archivo adjunto"}</strong><span className="mt-1 block text-xs text-[#64748b]">{sameOrigin ? "Descargar archivo" : pdf ? "Abrir PDF" : "Abrir archivo"}</span></span>
      <span className="shrink-0 text-xs font-medium text-[#9A7435]">{sameOrigin ? "Descargar" : "Abrir"}</span>
    </a> : <p role="alert" className="p-4 text-sm text-[#72132C]">El enlace de este archivo no es válido.</p>}
    {caption && <p className="border-t border-[#e5ded2] px-4 py-2 text-xs text-[#64748b]">{caption}</p>}
  </div>;
}

const FileBlock = createReactBlockSpec(
  { type: "file", propSchema: { backgroundColor: defaultProps.backgroundColor, name: { default: "" }, url: { default: "" }, caption: { default: "" } }, content: "none" },
  { render: ({ block }) => <ExternalFileCard url={block.props.url} name={block.props.name} caption={block.props.caption} /> },
);

const VideoBlock = createReactBlockSpec(
  {
    type: "video",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      backgroundColor: defaultProps.backgroundColor,
      name: { default: "" },
      url: { default: "" },
      caption: { default: "" },
      showPreview: { default: true },
      previewWidth: { default: undefined, type: "number" },
    },
    content: "none",
  },
  { render: ({ block }) => {
    const safe = safeHttpUrl(block.props.url);
    if (!safe) return <p role="alert" className="my-3 rounded border border-[#d8c6aa] bg-white p-4 text-sm text-[#72132C]">El enlace de este video no es válido.</p>;
    if (!block.props.showPreview) return <ExternalFileCard url={safe} name={block.props.name || "Video"} caption={block.props.caption} />;
    return <div className="my-3 w-full min-w-0 overflow-hidden" style={{ maxWidth: block.props.previewWidth || "100%" }}>
      <figure className="overflow-hidden rounded-lg bg-slate-900">
        <video src={safe} controls preload="metadata" className="block max-h-[70vh] w-full" />
        {block.props.caption && <figcaption className="px-4 py-2 text-xs text-white">{block.props.caption}</figcaption>}
      </figure>
      <ExternalFileCard url={safe} name={block.props.name || "Video original"} caption="La apertura o descarga depende del servicio que aloja el video." />
    </div>;
  } },
);

export const lessonSchema = BlockNoteSchema.create().extend({ blockSpecs: { youtube: YouTubeBlock(), bookmark: BookmarkBlock(), file: FileBlock(), video: VideoBlock() } });
export type LessonNoteBlock = typeof lessonSchema.Block;
export type LessonPartialBlock = typeof lessonSchema.PartialBlock;

export function legacyToBlockNote(blocks: LessonBlockDTO[] = []): LessonPartialBlock[] {
  const mapped = blocks.flatMap((block): LessonPartialBlock[] => {
    const content = block.content || "";
    switch (block.type) {
      case "h1": return [{ type: "heading", props: { level: 1 }, content }];
      case "h2": return [{ type: "heading", props: { level: 2 }, content }];
      case "h3": return [{ type: "heading", props: { level: 3 }, content }];
      case "bullet": return (block.items ?? [content]).map((item) => ({ type: "bulletListItem", content: item }));
      case "numbered": return (block.items ?? [content]).map((item) => ({ type: "numberedListItem", content: item }));
      case "quote": return [{ type: "quote", content }];
      case "code": return [{ type: "codeBlock", content }];
      case "toggle": return [{ type: "toggleListItem", content, children: block.toggleContent ? [{ type: "paragraph", content: block.toggleContent }] : [] }];
      case "link": return safeHttpUrl(content)
        ? [{ type: "paragraph", content: [{ type: "link", href: content, content }] }]
        : [{ type: "paragraph", content }];
      default: return [{ type: "paragraph", content }];
    }
  });
  return mapped.length ? mapped : [{ type: "paragraph" }];
}

export function noteBlocks(document?: RichLessonDocument, legacy: LessonBlockDTO[] = []): LessonPartialBlock[] {
  if (document?.version === 1 && document.blocks.length > 0) {
    return document.blocks as LessonPartialBlock[];
  }
  return legacyToBlockNote(legacy);
}

export function serializeNote(blocks: readonly LessonNoteBlock[]): RichLessonDocument {
  return { version: 1, blocks: JSON.parse(JSON.stringify(blocks)) as Record<string, unknown>[] };
}
