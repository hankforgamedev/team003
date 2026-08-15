"use client";

// 知識庫頁：換成 team003 的 <KnowledgeBase /> 模組。
// - 舊的 KnowledgeCard 六分類已捨棄，改用團 003 的資料夾＋標籤雙獨立分類
// - store 用單例 LocalStorageStore，第一次載入時把 sales-next 的會議 seed 進來
// - onOpenMeeting 導到會議詳細頁
// - LlmProvider 走 /api/kb-ask（目前接 OpenAI GPT），失敗自動降級成內建抽取式回答

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeBase } from "@sales-next/knowledge-base/react";
import type { KnowledgeStore } from "@sales-next/knowledge-base";
import { useSales } from "@/lib/store";
import { getKbStore, seedKbFromMeetings } from "@/lib/kb/store";
import { createServerLlmProvider } from "@/lib/kb/provider";

export default function KnowledgePage() {
  const router = useRouter();
  const meetings = useSales((s) => s.meetings);
  const hydrated = useSales((s) => s.hydrated);

  const [store, setStore] = useState<KnowledgeStore | null>(null);

  // hydrate 完成之後才建 store 並 seed，避免 SSR 對 localStorage 亂動。
  // seedKbFromMeetings 是 idempotent（同 id 不會重複灌），所以 meetings 變動
  // 就再跑一次是安全的 —— 也順便處理「reset KB 之後 sales-next 會議自動回來」。
  useEffect(() => {
    if (!hydrated) return;
    setStore(getKbStore());
    void seedKbFromMeetings(meetings);
  }, [hydrated, meetings]);

  const askOptions = useMemo(() => ({ provider: createServerLlmProvider() }), []);

  if (!store) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">
        載入知識庫…
      </div>
    );
  }

  return (
    <div className="kb-scope">
      <KnowledgeBase
        store={store}
        askOptions={askOptions}
        mode="both"
        onOpenMeeting={(meetingId) => router.push(`/meetings/${meetingId}`)}
      />
    </div>
  );
}
