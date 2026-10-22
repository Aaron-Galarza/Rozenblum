"use client";

import { useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { RichLessonDocument } from "@rozenblum/shared";
import { lessonSchema, noteBlocks } from "../../lib/lesson-document";

export default function RichLessonViewer({ document }: { document: RichLessonDocument }) {
  const initialContent = useMemo(() => noteBlocks(document), [document]);
  const editor = useCreateBlockNote({ schema: lessonSchema, initialContent });
  return <div className="lesson-rich-viewer"><BlockNoteView editor={editor} editable={false} theme="light" sideMenu={false} formattingToolbar={false} slashMenu={false} /></div>;
}
