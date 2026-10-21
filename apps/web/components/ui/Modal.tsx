"use client";

import { useId } from "react";
import { useModalA11y } from "../../lib/use-modal-a11y";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Overlay stacking order. Defaults to 200. */
  zIndex?: number;
};

/**
 * Accessible modal shell shared by the admin, teacher and public panels.
 * Handles Escape, focus trapping, initial focus and focus restoration.
 */
export default function Modal({ title, onClose, children, zIndex = 200 }: ModalProps) {
  const titleId = useId();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
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
        className="w-full max-w-md mx-4 p-6 rounded-lg outline-none"
        style={{
          backgroundColor: "#FAF8F5",
          border: "1px solid rgba(181,138,67,0.3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div className="flex items-center justify-between mb-5">
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
            className="hover:opacity-50 transition-opacity"
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
        {children}
      </div>
    </div>
  );
}
