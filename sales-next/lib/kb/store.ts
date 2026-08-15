// 知識庫 store 的橋接層：
//   - 建立 team003 的 LocalStorageStore 單例
//   - 把 sales-next 的會議 seed 進去（沒填過才灌，重複 seed 不會壞）
//   - 提供 syncMeetings 給 zustand subscribe 用，新增/更新會議時同步進 KB

import {
  createDefaultStore,
  ingest,
  prepareMeetingDoc,
  type KnowledgeStore,
  type MeetingJson,
} from "@sales-next/knowledge-base";
import type { Meeting } from "@/lib/types";
import {
  meetingSummaryMarkdown,
  meetingToJson,
  meetingTranscriptMarkdown,
} from "@/lib/kb/adapter";

let storePromise: Promise<KnowledgeStore> | null = null;

/** 取得 KB store 單例。第一次拿的時候會建立。 */
export function getKbStore(): KnowledgeStore {
  if (typeof window === "undefined") {
    // SSR 呼叫走這裡：回一個記憶體實作，避免爆錯，但實際用不到。
    return createDefaultStore();
  }
  return sharedStore();
}

let cached: KnowledgeStore | null = null;
function sharedStore(): KnowledgeStore {
  if (!cached) cached = createDefaultStore();
  return cached;
}

/** 把一場 sales-next 的會議寫進 KB（idempotent：同 id 會覆蓋）。 */
async function upsertMeeting(store: KnowledgeStore, m: Meeting): Promise<void> {
  const json: MeetingJson = meetingToJson(m);
  const { doc } = prepareMeetingDoc(json);

  // 附加逐字稿與摘要，讓 KB 檢索能命中會議原話與重點條列。
  const extras = [meetingSummaryMarkdown(m), meetingTranscriptMarkdown(m)]
    .filter(Boolean)
    .join("\n\n");
  const body = extras ? `${doc.body}\n\n${extras}` : doc.body;

  // 用會議 id 當 KB doc id，讓後續同步是覆蓋而不是複製。
  await store.putDoc({
    ...doc,
    id: `kb-${m.id}`,
    body,
    source: "meeting",
  });
}

/**
 * 首次載入時把 sales-next 的會議灌進 KB。
 * 已經有相同 id 的文件會被覆蓋（避免重複），沒有的就補進來。
 */
export async function seedKbFromMeetings(meetings: Meeting[]): Promise<void> {
  const store = getKbStore();
  const existing = await store.listDocs();
  const existingIds = new Set(existing.map((d) => d.id));

  // 只塞還沒進 KB 的會議。已存在的不動，避免蓋掉使用者的手動修改。
  for (const m of meetings) {
    if (existingIds.has(`kb-${m.id}`)) continue;
    await upsertMeeting(store, m);
  }
}

/** 清空 KB 後只重灌目前工作區會議；給 demo reset / 聯動測試重建乾淨狀態。 */
export async function resetKbWithMeetings(meetings: Meeting[]): Promise<void> {
  const store = getKbStore();
  await store.clear();
  for (const m of meetings) {
    await upsertMeeting(store, m);
  }
}

/** 新增會議時的 side effect：把新會議塞進 KB。 */
export async function syncMeetingToKb(m: Meeting): Promise<void> {
  const store = getKbStore();
  await upsertMeeting(store, m);
}

/** 一般文件的 ingest（給知識庫 import 面板用，直接轉發到 team003 的 ingest）。 */
export async function ingestToKb(input: string | MeetingJson) {
  const store = getKbStore();
  return ingest(store, input);
}
