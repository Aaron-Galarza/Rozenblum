"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@rozenblum/shared";
import { getSession, SESSION_CHANGED, type Session } from "./api";

/** Client-side session guard. V0.1 tradeoff: the API still validates every call. */
export function useSession(requiredRole?: Role) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const checkSession = () => {
    const current = getSession();
    if (!current) {
      setReady(false);
      setSession(null);
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (requiredRole && current.user.role !== requiredRole) {
      setReady(false);
      setSession(null);
      router.replace(`/${current.user.role}`);
      return;
    }
    setSession(current);
    setReady(true);
    };
    checkSession();
    window.addEventListener(SESSION_CHANGED, checkSession);
    window.addEventListener("storage", checkSession);
    window.addEventListener("pageshow", checkSession);
    return () => {
      window.removeEventListener(SESSION_CHANGED, checkSession);
      window.removeEventListener("storage", checkSession);
      window.removeEventListener("pageshow", checkSession);
    };
  }, [requiredRole, router]);

  return { session, ready };
}
