// 客戶端 LlmProvider：把問題和檢索到的 context 送到我們的 API route，
// route 那邊目前會呼叫 OpenAI GPT。失敗會丟 error，team003 的 ask() 會自動降級成
// 抽取式回答（就是「原文摘錄」），所以 demo 當天 AWS 掛掉也不會開天窗。

import type { LlmProvider } from "@sales-next/knowledge-base";

export function createServerLlmProvider(): LlmProvider {
  return {
    // team003 目前把 provider name 型別寫死成 bedrock；實際模型由 /api/kb-ask 決定。
    name: "bedrock",
    async complete({ question, context, signal }) {
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      };
      if (signal) init.signal = signal;

      const res = await fetch("/api/kb-ask", init);

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`kb-ask ${res.status}${detail ? `: ${detail}` : ""}`);
      }

      const data = (await res.json()) as { text?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.text) throw new Error("模型沒有回傳內容");
      return data.text;
    },
  };
}
