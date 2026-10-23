"use client";

import { BlockNoteSchema } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import type { LessonBlockDTO, RichLessonDocument } from "@rozenblum/shared";

export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
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
    let safe = false;
    try { safe = ["https:", "http:"].includes(new URL(url).protocol); } catch { /* invalid URL */ }
    return <div contentEditable={false} className="my-3 w-full min-w-0 overflow-hidden rounded-lg border border-[#d8c6aa] bg-white">
      {safe ? <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-col gap-4 p-3 text-[#173B6C] no-underline hover:bg-[#faf8f5] sm:flex-row">
        {/^[A-Za-z0-9_-]{11}$/.test(block.props.videoId) && <img src={`https://i.ytimg.com/vi/${block.props.videoId}/hqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full shrink-0 rounded object-cover sm:w-44" />}
        <span className="min-w-0 self-center"><strong className="block break-words text-sm leading-snug">{title || url}</strong>{block.props.channel && <span className="mt-1 block text-xs text-[#64748b]">{block.props.channel}</span>}<span className="mt-2 block break-all text-[11px] text-[#7a8493]">{url}</span></span>
      </a> : <span className="block p-4">Enlace inválido</span>}
    </div>;
  } },
);

export const lessonSchema = BlockNoteSchema.create().extend({ blockSpecs: { youtube: YouTubeBlock(), bookmark: BookmarkBlock() } });
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
      case "link": return [{ type: "paragraph", content: [{ type: "link", href: content, content }] }];
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
