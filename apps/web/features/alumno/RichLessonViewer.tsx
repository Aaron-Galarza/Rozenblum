"use client";

import { useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { es } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";
import "@blocknote/mantine/style.css";
import type { RichLessonDocument } from "@rozenblum/shared";
import { lessonSchema, noteBlocks, type LessonPartialBlock } from "../../lib/lesson-document";
import { optimizedImage } from "../../lib/images";

function optimizedBlocks(blocks: LessonPartialBlock[]): LessonPartialBlock[] {
  return blocks.map((block) => ({
    ...block,
    ...(block.type === "image" && block.props?.url
      ? { props: { ...block.props, url: optimizedImage(block.props.url, 1440) } }
      : {}),
    ...(block.children?.length ? { children: optimizedBlocks(block.children) } : {}),
  })) as LessonPartialBlock[];
}

export default function RichLessonViewer({ document }: { document: RichLessonDocument }) {
  const initialContent = useMemo(() => optimizedBlocks(noteBlocks(document)), [document]);
  const editor = useCreateBlockNote({ schema: lessonSchema, initialContent, dictionary: es });
  return <div className="lesson-rich-viewer"><BlockNoteView editor={editor} editable={false} theme="light" sideMenu={false} formattingToolbar={false} slashMenu={false} /></div>;
}
