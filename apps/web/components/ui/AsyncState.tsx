"use client";

export function LoadingScreen({ label = "Cargando..." }: { label?: string }) {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}
    >
      <svg
        className="animate-spin w-8 h-8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#B58A43"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
        <path d="M12 2a10 10 0 0110 10" />
      </svg>
      <p className="text-sm" style={{ color: "rgba(23,59,108,0.65)" }}>
        {label}
      </p>
    </div>
  );
}

export function ErrorPanel({
  title = "No pudimos cargar la información",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="mx-auto my-12 max-w-lg p-8 text-center"
      style={{
        backgroundColor: "#FFFFFF",
        border: "2px solid #B58A43",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        fontFamily: "'Roboto', sans-serif",
      }}
      role="alert"
    >
      <h2
        className="text-2xl font-light mb-3"
        style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
      >
        {title}
      </h2>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(23,59,108,0.7)" }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-3 text-xs font-bold tracking-widest rounded transition-all duration-200 hover:brightness-110"
          style={{ backgroundColor: "#173B6C", color: "#FAF8F5" }}
        >
          REINTENTAR
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="mx-auto my-12 max-w-lg p-8 text-center"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid rgba(23,59,108,0.12)",
        borderRadius: "8px",
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <h2
        className="text-2xl font-light mb-3"
        style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
      >
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(23,59,108,0.7)" }}>
        {message}
      </p>
    </div>
  );
}
