"use client";

import { useEffect, useState } from "react";
import type { SiteSettingsDTO } from "@rozenblum/shared";
import { apiFetch } from "./api";

export function usePublicSettings(): SiteSettingsDTO | null {
  const [settings, setSettings] = useState<SiteSettingsDTO | null>(null);

  useEffect(() => {
    apiFetch<SiteSettingsDTO>("/api/settings").then(setSettings).catch(() => setSettings(null));
  }, []);

  return settings;
}
