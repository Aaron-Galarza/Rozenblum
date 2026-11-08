"use client";

import { useId } from "react";
import { useModalA11y } from "../../lib/use-modal-a11y";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Overlay stacking order. Defaults to 200. */
  zIndex?: number;
  variant?: "default" | "chat";
};

/**
 * Accessible modal shell shared by the admin, teacher and public panels.
 * Handles Escape, focus trapping, initial focus and focus restoration.
 */
export default function Modal({ title, onClose, children, zIndex = 200, variant = "default" }: ModalProps) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const chat = variant === "chat";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-6"
      style={{ zIndex, backgroundColor: "rgba(23,59,108,0.5)", backdropFilter: "blur(3px)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={chat
          ? "flex w-full max-w-xl flex-col overflow-hidden rounded-lg outline-none"
          : "mx-4 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg p-6 outline-none"}
        style={{
          ...(chat ? { height: "min(44rem, calc(100dvh - 3rem))" } : {}),
          backgroundColor: "#FAF8F5",
          border: "1px solid rgba(181,138,67,0.3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div className={chat ? "flex shrink-0 items-center justify-between gap-3 border-b border-[#e5ded2] px-4 py-4 sm:px-6" : "mb-5 flex items-center justify-between"}>
          <h3
            id={titleId}
            style={{
              color: "#173B6C",
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.3rem",
              fontWeight: 500,
            }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:opacity-50 transition-opacity"
            style={{ color: "#173B6C" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {chat ? <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-6">{children}</div> : children}
      </div>
    </div>
  );
}
