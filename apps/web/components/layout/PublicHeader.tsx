"use client";

import { useRouter } from "next/navigation";

type PublicHeaderProps = {
  onLogoClick?: () => void;
  rightSlot?: React.ReactNode;
};

export default function PublicHeader({ onLogoClick, rightSlot }: PublicHeaderProps) {
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 h-[68px]"
      style={{ backgroundColor: "#FAF8F5", borderBottom: "1px solid rgba(23,59,108,0.1)" }}
    >
      <button onClick={onLogoClick ?? (() => router.push("/"))} className="flex items-center gap-3">
        <img
          src="https://res.cloudinary.com/dwqxdensk/image/upload/v1787947835/461451735_1057750859400196_1143453419980232675_n_nt27kp.png"
          alt="Estudio Jurídico Rozenblum"
          className="h-10 w-auto object-contain"
        />
        <span className="hidden sm:block text-sm font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>
          Estudio Jurídico Rozenblum
        </span>
      </button>

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-60 transition-opacity underline underline-offset-2"
          style={{ color: "#173B6C" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Volver a Inicio
        </button>
        {rightSlot}
      </div>
    </header>
  );
}
