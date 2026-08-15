"use client";

// 全域狀態：zustand + localStorage 持久化。
// 初始資料 = 30 筆跨部門聯動測試資料。
// 「重設示範資料」= 清空持久化層、重新生成。離線也能完整運作（Demo 保險路徑）。
//
// 註：知識庫問答歷史移到 @sales-next/knowledge-base 模組自己管，不再存在這裡。

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AiProvider, Deal, Meeting, ViewRole } from "@/lib/types";
import { normalizeAiProvider } from "@/lib/ai/provider-config";
import { buildIntegrationTestSeed } from "@/lib/data/integration-test";
import { resetKbWithMeetings, syncMeetingToKb } from "@/lib/kb/store";
import type { LineIntegrationRecord } from "@/lib/integrations/line-types";
import {
  dealIdForLineCustomer,
  lineRecordToDeal,
  lineRecordToMeeting,
} from "@/lib/integrations/line-client";

const DEFAULT_SEED_VERSION = "integration-30-v1";

interface SalesState {
  hydrated: boolean;
  seededAt: string | null;
  seedVersion: string | null;
  deals: Deal[];
  meetings: Meeting[];
  view: ViewRole;
  aiProvider: AiProvider;
  aiLive: boolean | null; // null = 尚未檢查；true = 目前選取的文字 AI provider 可用
  lineImportedRecordIds: string[];
  lineLastSyncedAt: string | null;
  setView: (v: ViewRole) => void;
  setAiProvider: (v: AiProvider) => void;
  setAiLive: (v: boolean | null) => void;
  seedIfNeeded: () => void;
  resetDemo: () => Promise<void>;
  resetIntegrationTestData: () => Promise<void>;
  addMeeting: (m: Meeting) => void;
  addDeal: (d: Deal) => void;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  syncLineRecords: (records: LineIntegrationRecord[]) => void;
}

function buildSeed() {
  return { ...buildIntegrationTestSeed(), seedVersion: DEFAULT_SEED_VERSION };
}

function sanitizePersistedState(persisted: unknown): Partial<SalesState> {
  if (!persisted || typeof persisted !== "object") return {};

  const raw = persisted as Record<string, unknown>;
  const state: Partial<SalesState> = {};

  if (typeof raw.seededAt === "string" || raw.seededAt === null) state.seededAt = raw.seededAt;
  if (typeof raw.seedVersion === "string" || raw.seedVersion === null) state.seedVersion = raw.seedVersion;
  if (Array.isArray(raw.deals)) state.deals = raw.deals as Deal[];
  if (Array.isArray(raw.meetings)) state.meetings = raw.meetings as Meeting[];
  if (raw.view === "rep" || raw.view === "manager") state.view = raw.view;
  if (raw.aiProvider !== undefined) state.aiProvider = normalizeAiProvider(raw.aiProvider);
  if (Array.isArray(raw.lineImportedRecordIds)) {
    state.lineImportedRecordIds = raw.lineImportedRecordIds.filter((value): value is string => typeof value === "string");
  }
  if (typeof raw.lineLastSyncedAt === "string" || raw.lineLastSyncedAt === null) {
    state.lineLastSyncedAt = raw.lineLastSyncedAt;
  }

  return state;
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
      aiProvider: "bedrock",
      aiLive: null,
      lineImportedRecordIds: [],
      lineLastSyncedAt: null,
      setView: (v) => set({ view: v }),
      setAiProvider: (v) => set({ aiProvider: v, aiLive: null }),
      setAiLive: (v) => set({ aiLive: v }),
      seedIfNeeded: () => {
        const { seededAt, seedVersion } = get();
        // 超過 3 天的舊資料自動重新生成，讓「本月」永遠有料；
        // 使用者自己新增的會議與案件（id 為 m-<ts>/d-<ts>）要保留，只重生內建母體。
        const stale = seededAt && Date.now() - new Date(seededAt).getTime() > 3 * 24 * 3600 * 1000;
        const needsMigration = seedVersion !== DEFAULT_SEED_VERSION;
        if (!seededAt || stale || needsMigration) {
          const userDeals = get().deals.filter((d) => /^d-\d+$/.test(d.id) || d.id.startsWith("line-deal-"));
          const userMeetings = get().meetings.filter((m) => /^m-\d+$/.test(m.id) || m.id.startsWith("line-"));
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
        set({ ...seed, view: "rep", lineImportedRecordIds: [], lineLastSyncedAt: null });
        await resetKbWithMeetings(seed.meetings).catch((e) => console.warn("reset KB failed", e));
      },
      resetIntegrationTestData: async () => {
        const seed = buildIntegrationTestSeed();
        set({ ...seed, view: "manager", lineImportedRecordIds: [], lineLastSyncedAt: null });
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
      syncLineRecords: (records) => {
        const assigned = records.filter((record) => record.assigned);
        if (!assigned.length) {
          set({ lineLastSyncedAt: new Date().toISOString() });
          return;
        }

        const current = get();
        const imported = new Set(current.lineImportedRecordIds);
        const newMeetings = assigned.map(lineRecordToMeeting);
        const meetingById = new Map(current.meetings.map((meeting) => [meeting.id, meeting]));
        newMeetings.forEach((meeting) => meetingById.set(meeting.id, meeting));

        const grouped = new Map<string, LineIntegrationRecord[]>();
        assigned.forEach((record) => {
          const key = dealIdForLineCustomer(record);
          grouped.set(key, [...(grouped.get(key) ?? []), record]);
        });
        const dealById = new Map(current.deals.map((deal) => [deal.id, deal]));
        grouped.forEach((customerRecords, dealId) => {
          const sorted = [...customerRecords].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
          const meetingIds = sorted.map((record) => `line-${record.id}`);
          const next = lineRecordToDeal(sorted[0]!, meetingIds);
          const previous = dealById.get(dealId);
          dealById.set(dealId, previous ? { ...previous, ...next, meetingIds } : next);
        });

        set({
          meetings: [...meetingById.values()].sort((left, right) => right.date.localeCompare(left.date)),
          deals: [...dealById.values()],
          lineImportedRecordIds: Array.from(new Set([...current.lineImportedRecordIds, ...assigned.map((record) => record.id)])),
          lineLastSyncedAt: new Date().toISOString(),
        });

        assigned
          .filter((record) => !imported.has(record.id))
          .map(lineRecordToMeeting)
          .forEach((meeting) => {
            void syncMeetingToKb(meeting).catch((e) => console.warn("sync LINE meeting to KB failed", e));
          });
      },
    }),
    {
      name: "sales-next-store-v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted) => sanitizePersistedState(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersistedState(persisted),
      }),
      partialize: (s) => ({
        seededAt: s.seededAt,
        seedVersion: s.seedVersion,
        deals: s.deals,
        meetings: s.meetings,
        view: s.view,
        aiProvider: s.aiProvider,
        lineImportedRecordIds: s.lineImportedRecordIds,
        lineLastSyncedAt: s.lineLastSyncedAt,
      }),
    }
  )
);
