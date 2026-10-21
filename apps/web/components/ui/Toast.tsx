"use client";

type ToastProps = {
  message: string;
  error?: boolean;
};

/** Bottom-centered confirmation toast announced politely to screen readers. */
export default function Toast({ message, error = false }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] px-5 py-3 rounded-lg shadow-xl text-sm font-medium"
      style={{
        backgroundColor: error ? "#72132C" : "#173B6C",
        color: "#FAF8F5",
        border: "1px solid #B58A43",
      }}
    >
      {message}
    </div>
  );
}
