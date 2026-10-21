"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@rozenblum/shared";
import { getSession, type Session } from "./api";

/** Client-side session guard. V0.1 tradeoff: the API still validates every call. */
export function useSession(requiredRole?: Role) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (requiredRole && current.user.role !== requiredRole) {
      router.replace(`/${current.user.role}`);
      return;
    }
    setSession(current);
    setReady(true);
  }, [requiredRole, router]);

  return { session, ready };
}
