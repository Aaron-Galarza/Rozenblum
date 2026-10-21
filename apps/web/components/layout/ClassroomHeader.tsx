"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession } from "../../lib/api";

type ClassroomHeaderProps = {
  breadcrumb?: React.ReactNode;
  notificationCount?: number;
  userInitials: string;
  userName: string;
  userMenuItems?: string[];
};

export default function ClassroomHeader({ breadcrumb, notificationCount = 0, userInitials, userName, userMenuItems = [] }: ClassroomHeaderProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const logout = () => {
    clearSession();
    router.push("/");
  };

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-6 h-[70px] z-40" style={{ backgroundColor: "#FAF8F5", borderBottom: "2px solid #B58A43" }}>
      <button onClick={() => router.push("/")} className="flex items-center gap-3">
        <img src="https://res.cloudinary.com/dwqxdensk/image/upload/v1787947835/461451735_1057750859400196_1143453419980232675_n_nt27kp.png" alt="Logo" className="h-9 w-auto object-contain" />
        <span className="hidden sm:block text-sm font-medium" style={{ color: "#173B6C", fontFamily: "'Cormorant Garamond', serif" }}>Estudio Jurídico Rozenblum</span>
      </button>
      {breadcrumb && (
        <p className="text-xs hidden md:block" style={{ color: "#173B6C", opacity: 0.7 }}>
          {breadcrumb}
        </p>
      )}
      <div className="flex items-center gap-4">
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="1.5" className="w-6 h-6 cursor-pointer"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
          {notificationCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: "#B58A43", color: "#FAF8F5" }}>{notificationCount}</div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#173B6C", color: "#B58A43" }}>{userInitials}</div>
            <span className="hidden sm:block text-xs" style={{ color: "#173B6C" }}>{userName}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#173B6C" strokeWidth="2" className="w-4 h-4"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-12 w-48 z-50 shadow-xl" style={{ backgroundColor: "#FAF8F5", border: "1px solid rgba(23,59,108,0.15)" }}>
              {userMenuItems.map((item) => (
                <button key={item} className="block w-full text-left px-4 py-2.5 text-xs hover:opacity-70 transition-opacity" style={{ color: "#173B6C" }}>{item}</button>
              ))}
              <div className="h-px" style={{ backgroundColor: "rgba(23,59,108,0.1)" }} />
              <button onClick={logout} className="block w-full text-left px-4 py-2.5 text-xs font-medium" style={{ color: "#B58A43" }}>Logout</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
