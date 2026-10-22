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
    propSchema: { videoId: { default: "" } },
    content: "none",
  },
  {
    render: ({ block }) => {
      const id = block.props.videoId;
      return <div contentEditable={false} className="my-3 aspect-video max-w-2xl overflow-hidden rounded-lg bg-slate-900">
        {/^[A-Za-z0-9_-]{11}$/.test(id)
          ? <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}`} title="Video de YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <p className="p-5 text-white">Video inválido</p>}
      </div>;
    },
  },
);

const BookmarkBlock = createReactBlockSpec(
  { type: "bookmark", propSchema: { url: { default: "" }, title: { default: "" } }, content: "none" },
  { render: ({ block }) => {
    const { url, title } = block.props;
    let safe = false;
    try { safe = ["https:", "http:"].includes(new URL(url).protocol); } catch { /* invalid URL */ }
    return <div contentEditable={false} className="my-3 max-w-2xl rounded-lg border border-[#d8c6aa] bg-white p-4">
      {safe ? <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-[#173B6C] underline underline-offset-2">{title || url}</a> : <span>Enlace inválido</span>}
      {safe && <span className="mt-1 block truncate text-xs text-[#7a8493]">{url}</span>}
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
