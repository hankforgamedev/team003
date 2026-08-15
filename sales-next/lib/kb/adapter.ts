// sales-next 的 Meeting 型別跟 team003 知識庫的 MeetingJson 是兩套 schema，
// 這裡負責把 sales-next 的會議轉成知識庫可以 ingest 的格式。
// 額外把逐字稿附加在 body 尾巴，讓 KB 檢索能命中會議原話。

import type { DecisionMaker, MeetingJson } from "@sales-next/knowledge-base";
import type { Meeting } from "@/lib/types";

function parseDecisionMaker(str: string | undefined): DecisionMaker | null {
  if (!str) return null;
  const attended = str.includes("到場") && !str.includes("未到場")
    ? true
    : str.includes("未到場") || str.includes("未出席") || str.includes("未參與")
      ? false
      : null;

  let name: string | null = null;
  let role: string | null = null;
  const paren = str.match(/[（(]([^）)]+)[）)]/);
  if (paren && paren[1]) {
    const parts = paren[1].split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      name = parts[0] ?? null;
      role = parts.slice(1).join(" ");
    } else if (parts.length === 1) {
      role = parts[0] ?? null;
    }
  }

  return { name, role, attended };
}

// 猜哪一段 keyQuote 屬於哪個欄位。抽不到就掛在 objection 上當通用引用。
function bucketQuotes(keyQuotes: string[] | undefined): MeetingJson["quotes"] {
  if (!keyQuotes?.length) return null;
  const quotes: Record<string, string | null> = {
    budget: null,
    objection: null,
    plan: null,
    decision_maker: null,
  };
  for (const q of keyQuotes) {
    if (!quotes.budget && /預算|金額|萬|預估|一百|價/.test(q)) quotes.budget = q;
    else if (!quotes.objection && /擔心|疑慮|高|不確定|問題|貴|太/.test(q)) quotes.objection = q;
    else if (!quotes.plan && /方案|年約|月約|季約|試/.test(q)) quotes.plan = q;
    else if (!quotes.decision_maker && /老闆|總經理|總監|決定|核准|要跟|給.*看/.test(q))
      quotes.decision_maker = q;
    else if (!quotes.objection) quotes.objection = q;
  }
  return quotes;
}

export function meetingToJson(m: Meeting): MeetingJson {
  const e = m.extraction;
  const dateOnly = m.date.slice(0, 10);

  if (!e) {
    return {
      meeting_id: m.id,
      meeting_date: dateOnly,
      company: m.title,
    };
  }

  return {
    meeting_id: m.id,
    meeting_date: dateOnly,
    company: e.company || m.title,
    contact_name: e.contact || null,
    contact_role: e.role || null,
    customer_type: e.customerType || null,
    stage: e.stage || null,
    plan: e.plan || null,
    need: e.need || null,
    budget: e.budget || null,
    budget_confidence: e.budgetConfirmed || null,
    timeline: e.timeline || null,
    objection: e.objections?.[0] || null,
    decision_maker: parseDecisionMaker(e.decisionMaker),
    next_action: e.nextActions?.[0] || null,
    follow_up_raw: e.followUpDate || null,
    follow_up_date: null,
    quotes: bucketQuotes(e.keyQuotes),
  };
}

/** 逐字稿轉 Markdown，附在 KB 文件尾巴讓檢索命中原話。 */
export function meetingTranscriptMarkdown(m: Meeting): string {
  if (!m.transcript?.length) return "";
  const lines = m.transcript.map((s) => `- **${s.speaker}**：${s.text}`);
  return `## 逐字稿\n${lines.join("\n")}`;
}

/** 會議摘要（重點條列）轉 Markdown。 */
export function meetingSummaryMarkdown(m: Meeting): string {
  if (!m.summary?.length) return "";
  const lines = m.summary.map((s) => `- ${s}`);
  return `## 會議摘要\n${lines.join("\n")}`;
}
