import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "#FAF8F5", fontFamily: "'Roboto', sans-serif" }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
        <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "#B58A43" }}>Error 404</span>
        <div className="h-px w-10" style={{ backgroundColor: "#B58A43" }} />
      </div>
      <h1
        className="text-5xl font-light mb-4"
        style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}
      >
        Página no encontrada
      </h1>
      <p className="text-base mb-8 max-w-md" style={{ color: "rgba(23,59,108,0.7)" }}>
        La dirección que buscás no existe o fue movida. Podés volver al inicio o explorar el catálogo de cursos.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/"
          className="px-6 py-3 text-xs font-bold tracking-widest rounded transition-all duration-200 hover:brightness-110"
          style={{ backgroundColor: "#173B6C", color: "#FAF8F5" }}
        >
          IR AL INICIO
        </Link>
        <Link
          href="/catalogo"
          className="px-6 py-3 text-xs font-bold tracking-widest rounded border transition-all duration-200 hover:opacity-70"
          style={{ color: "#173B6C", borderColor: "#B58A43" }}
        >
          VER CURSOS
        </Link>
      </div>
    </div>
  );
}
