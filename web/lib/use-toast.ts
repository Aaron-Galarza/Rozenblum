"use client";

import { useEffect, useRef, useState } from "react";

export function useToast(duration = 2500) {
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const showToast = (text: string, error = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, error });
    timer.current = setTimeout(() => setToast(null), duration);
  };
  return { toast, showToast };
}
