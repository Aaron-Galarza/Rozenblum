"use client";

import { useState } from "react";
import { errorMessage } from "./api";
import { useToast } from "./use-toast";

export function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const { toast, showToast } = useToast();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showToast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  };

  return { busy, toast, showToast, run };
}
