"use client";

import { useLayoutEffect, useRef } from "react";

/** Follow new messages while the reader is near the bottom; preserve their place otherwise. */
export function useChatScroll<T extends HTMLElement>(messages: readonly unknown[], conversationKey: string | null) {
  const ref = useRef<T>(null);
  const followLatest = useRef(true);

  useLayoutEffect(() => {
    followLatest.current = true;
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [conversationKey]);

  useLayoutEffect(() => {
    if (followLatest.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;
    followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  return { ref, onScroll };
}
