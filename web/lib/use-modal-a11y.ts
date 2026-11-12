"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openDialogs: HTMLElement[] = [];

function focusableInside(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Adds Escape-to-close, focus trapping, initial focus and focus restoration to a
 * dialog. Returns the ref to attach to the dialog element (it should be focusable).
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  enabled = true,
  onEscape?: (event: KeyboardEvent) => boolean,
) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
    onEscapeRef.current = onEscape;
  }, [onClose, onEscape]);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    const restore = document.activeElement as HTMLElement | null;
    openDialogs.push(node);

    if (node && !node.contains(document.activeElement)) {
      const items = focusableInside(node);
      const preferred = items.find((item) => item.matches("input, textarea, select"));
      (preferred ?? items[0] ?? node).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== node) return;
      if (event.key === "Escape") {
        if (onEscapeRef.current?.(event)) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusableInside(node);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!node.contains(document.activeElement) || document.activeElement === node) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocus = (event: FocusEvent) => {
      if (openDialogs[openDialogs.length - 1] !== node) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || node.contains(target)) return;
      // BlockNote renders its editor menus in a portal outside the dialog.
      if (node.closest(".lesson-rich-editor") || node.querySelector(".lesson-rich-editor")) {
        if (target.closest(".bn-root")) return;
      }
      (focusableInside(node)[0] ?? node).focus();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocus, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocus, true);
      const index = openDialogs.lastIndexOf(node);
      if (index !== -1) openDialogs.splice(index, 1);
      document.body.style.overflow = previousOverflow;
      restore?.focus?.();
    };
  }, [enabled]);

  return ref;
}
