"use client";

// 全域狀態：zustand + localStorage 持久化。
// 初始資料 = 30 筆跨部門聯動測試資料。
// 「重設示範資料」= 清空持久化層、重新生成。離線也能完整運作（Demo 保險路徑）。
//
// 註：知識庫問答歷史移到 @sales-next/knowledge-base 模組自己管，不再存在這裡。

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Deal, Meeting, ViewRole } from "@/lib/types";
import { buildIntegrationTestSeed } from "@/lib/data/integration-test";
import { resetKbWithMeetings, syncMeetingToKb } from "@/lib/kb/store";

const DEFAULT_SEED_VERSION = "integration-30-v1";

interface SalesState {
  hydrated: boolean;
  seededAt: string | null;
  seedVersion: string | null;
  deals: Deal[];
  meetings: Meeting[];
  view: ViewRole;
  aiLive: boolean | null; // null = 尚未檢查；true = 有 OPENAI_API_KEY
  setView: (v: ViewRole) => void;
  setAiLive: (v: boolean) => void;
  seedIfNeeded: () => void;
  resetDemo: () => Promise<void>;
  resetIntegrationTestData: () => Promise<void>;
  addMeeting: (m: Meeting) => void;
  addDeal: (d: Deal) => void;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
}

function buildSeed() {
  return { ...buildIntegrationTestSeed(), seedVersion: DEFAULT_SEED_VERSION };
}

export const useSales = create<SalesState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      seededAt: null,
      seedVersion: null,
      deals: [],
      meetings: [],
      view: "rep",
      aiLive: null,
      setView: (v) => set({ view: v }),
      setAiLive: (v) => set({ aiLive: v }),
      seedIfNeeded: () => {
        const { seededAt, seedVersion } = get();
        // 超過 3 天的舊資料自動重新生成，讓「本月」永遠有料；
        // 使用者自己新增的會議與案件（id 為 m-<ts>/d-<ts>）要保留，只重生內建母體。
        const stale = seededAt && Date.now() - new Date(seededAt).getTime() > 3 * 24 * 3600 * 1000;
        const needsMigration = seedVersion !== DEFAULT_SEED_VERSION;
        if (!seededAt || stale || needsMigration) {
          const userDeals = get().deals.filter((d) => /^d-\d+$/.test(d.id));
          const userMeetings = get().meetings.filter((m) => /^m-\d+$/.test(m.id));
          const seed = buildSeed();
          set({
            ...seed,
            deals: [...userDeals, ...seed.deals],
            meetings: [...userMeetings, ...seed.meetings],
          });
          void resetKbWithMeetings([...userMeetings, ...seed.meetings]).catch((e) =>
            console.warn("reset KB failed", e)
          );
        }
        set({ hydrated: true });
      },
      resetDemo: async () => {
        const seed = buildSeed();
        set({ ...seed, view: "rep" });
        await resetKbWithMeetings(seed.meetings).catch((e) => console.warn("reset KB failed", e));
      },
      resetIntegrationTestData: async () => {
        const seed = buildIntegrationTestSeed();
        set({ ...seed, view: "manager" });
        await resetKbWithMeetings(seed.meetings).catch((e) => console.warn("reset KB failed", e));
      },
      addMeeting: (m) => {
        set({ meetings: [m, ...get().meetings] });
        // 同步進知識庫，讓新會議立刻可以被問答檢索到
        void syncMeetingToKb(m).catch((e) => console.warn("sync meeting to KB failed", e));
      },
      addDeal: (d) => set({ deals: [d, ...get().deals] }),
      updateDeal: (id, patch) =>
        set({ deals: get().deals.map((d) => (d.id === id ? { ...d, ...patch } : d)) }),
    }),
    {
      name: "sales-next-store-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        seededAt: s.seededAt,
        seedVersion: s.seedVersion,
        deals: s.deals,
        meetings: s.meetings,
        view: s.view,
      }),
    }
  )
);
