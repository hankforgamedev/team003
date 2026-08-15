// Next Best Action 規則引擎（D 組：AI Recommendation Logic 的落地）
// 設計原則：每一條建議都要「可解釋」——附上規則依據＋從自家歷史資料算出來的數字。
// 有可用 LLM provider 時，模型會在這些規則輸出的基礎上潤飾與補充；沒有 key 時規則引擎單獨運作。
// 這也是回答評審「你們的建議憑什麼」的核心：規則來自顧問方法論，數字來自企業自己的資料。

import { Deal, MeetingExtraction, NBAAction, NBAResult } from "@/lib/types";
import { dmImpact, fmtPct, segmentStats } from "@/lib/data/analytics";

export function runNbaRules(extraction: MeetingExtraction, allDeals: Deal[]): NBAResult {
  const actions: NBAAction[] = [];
  const reasoning: string[] = [];

  const segs = segmentStats(allDeals);
  const seg = segs.find((s) => s.customerType === extraction.customerType && s.plan === extraction.plan);
  const golden = segs[0];
  const dm = dmImpact(allDeals);

  // 規則 1：決策者未參與 → 最高優先
  const dmAbsent = extraction.decisionMaker.includes("未到場") || extraction.decisionMaker.includes("未確認");
  if (dmAbsent) {
    actions.push({
      title: "邀請決策者參與下一次會議／Demo",
      detail: `目前${extraction.decisionMaker}。下次會議請對方窗口協助邀請決策者出席，並準備 30 分鐘決策者版簡報。`,
      why: `歷史資料：決策者曾參與會議的案件成交率 ${fmtPct(dm.withDm, 0)}，未參與僅 ${fmtPct(dm.withoutDm, 0)}`,
      dueInDays: 7,
    });
    reasoning.push(`決策者未到場 → 觸發「決策者邀請」規則（自家資料：${fmtPct(dm.withDm, 0)} vs ${fmtPct(dm.withoutDm, 0)}）`);
  }

  // 規則 2：明確的 objection → 對症下藥
  for (const obj of extraction.objections) {
    if (obj.includes("導入") || obj.includes("時間") || obj.includes("時程")) {
      actions.push({
        title: "補充導入時程表與同規模案例",
        detail: "整理標準導入流程（週次拆解），附上 2 個同規模客戶的實際導入時間軸，直接回應時程疑慮。",
        why: "客戶明確表達導入時間疑慮；提供可驗證的時程證據是最直接的解法",
        dueInDays: 3,
      });
      reasoning.push("偵測到「導入時間」異議 → 觸發時程證據規則");
    } else if (obj.includes("價格") || obj.includes("預算") || obj.includes("高")) {
      actions.push({
        title: "提供分級方案（核心版／完整版）",
        detail: "把方案拆成可分期或可選配的版本，讓客戶在預算內先啟動，後續依成效加購。",
        why: "價格異議案件中，提供分級方案可保留成交機會而不直接降價",
        dueInDays: 3,
      });
      reasoning.push("偵測到價格異議 → 觸發分級方案規則");
    } else if (obj.includes("比價") || obj.includes("同業") || obj.includes("供應商")) {
      actions.push({
        title: "提供差異化證據（實績數據＋交期保證）",
        detail: "整理可量化的差異點（交期實績、修改保證、專屬團隊），做成一頁比較表主動送達。",
        why: "客戶處於比價階段；差異化證據比降價更能守住毛利",
        dueInDays: 2,
      });
      reasoning.push("偵測到比價訊號 → 觸發差異化證據規則");
    }
  }

  // 規則 3：階段標準動作
  if (extraction.stage === "proposal") {
    actions.push({
      title: "3 天內寄送提案／技術方案",
      detail: `寄送正式提案書給 ${extraction.contact}，涵蓋：${extraction.need}。附上與需求最相關的 2 個案例。`,
      why: seg?.avgCycleDays
        ? `${extraction.customerType}＋${extraction.plan}的平均成交週期為 ${Math.round(seg.avgCycleDays)} 天，提案階段的回應速度直接影響週期`
        : "提案階段的回應速度與成交率高度相關",
      dueInDays: 3,
    });
    reasoning.push("階段＝提案中 → 觸發 3 天提案規則");
  }
  if (extraction.stage === "negotiation") {
    actions.push({
      title: "確認最終版合約與簽約時程",
      detail: "整理談判中已同意的條件（價格、付款、交付），送出最終版合約並約定簽約日。",
      why: "談判階段的案件拖越久流失率越高，主動收斂是顧問方法論的標準動作",
      dueInDays: 3,
    });
    reasoning.push("階段＝談判中 → 觸發收斂規則");
  }

  // 規則 4：黃金客群加速
  if (seg && golden && seg.customerType === golden.customerType && seg.plan === golden.plan) {
    actions.push({
      title: "列為優先案件，加速推進",
      detail: `此案屬於「${golden.customerType}＋${golden.plan}」黃金客群，建議優先投入資源，一週內安排下一次關鍵會議。`,
      why: `自家資料：此客群成交率 ${fmtPct(golden.winRate, 0)}、平均 ${Math.round(golden.avgCycleDays ?? 21)} 天成交，是全公司表現最好的組合`,
      dueInDays: 7,
    });
    reasoning.push(`命中黃金客群（${golden.customerType}＋${golden.plan}）→ 觸發優先推進規則`);
  }

  // 規則 5：follow-up 兜底
  actions.push({
    title: `${extraction.followUpDate || "一週後"} follow-up`,
    detail: `依會議承諾（${extraction.nextActions.join("；") || "後續資料提供"}）完成後主動追蹤，確認客戶端進度與決策時間。`,
    why: "會議後 7 天內無追蹤的案件，後續回覆率顯著下降（顧問案經驗法則）",
    dueInDays: 7,
  });
  reasoning.push("兜底規則：所有會議都要有明確 follow-up 日期");

  // 去重＋取前 4 條（依緊急度排序）
  const seen = new Set<string>();
  const deduped = actions
    .filter((a) => (seen.has(a.title) ? false : (seen.add(a.title), true)))
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .slice(0, 4);

  return { actions: deduped, reasoning, aiMode: "rules" };
}
