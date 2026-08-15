"use client";

import { useEffect } from "react";
import { useSales } from "@/lib/store";
import type { LineRecordsResponse } from "@/lib/integrations/line-types";

export function LineIntegrationBridge() {
  const hydrated = useSales((state) => state.hydrated);
  const syncLineRecords = useSales((state) => state.syncLineRecords);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function sync() {
      try {
        const response = await fetch("/api/integrations/line/records", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as LineRecordsResponse;
        if (!cancelled) syncLineRecords(payload.records);
      } catch {
        // LINE 是附加資料源；網路中斷時保留目前工作區，不干擾既有功能。
      }
    }

    void sync();
    const timer = window.setInterval(() => void sync(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated, syncLineRecords]);

  return null;
}
