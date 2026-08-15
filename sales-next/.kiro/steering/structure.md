# 專案結構與協作規則

## 檔案地圖
```
lib/types.ts              資料模型（Deal / Meeting / MeetingExtraction / NBA / AiProvider）
lib/store.ts              zustand 全域狀態、示範資料 seed 與重設
lib/pipeline.ts           桃園新竹 pipeline 順序、逐字稿/JSON normalize
lib/data/generator.ts     確定性母體（520 筆案件，固定 seed）
lib/data/showcase.ts      手工重點案件 ＋ ABC 品牌示範會議腳本
lib/data/analytics.ts     所有分析函式（漏斗、轉換率、成交週期、黃金客群、決策者影響）
lib/ai/llm.ts             Bedrock/OpenAI server provider 分流
lib/ai/provider-config.ts provider 選項與預設 Bedrock
lib/ai/openai.ts          OpenAI GPT/Whisper helper（server only）
lib/ai/client.ts          前端 AI 呼叫＋自動降級
lib/ai/demo-engine.ts     離線備援：規則式抽取與檢索問答
lib/ai/nba-rules.ts       顧問規則引擎（Next Best Action）
app/page.tsx              總覽（雙視角）
app/meetings/new/page.tsx wow moment 流程（四種輸入＋四階段動畫）
app/meetings/[id]/        會議詳情｜app/deals/  案件管理｜app/knowledge/  知識庫
app/funnel/ app/analytics/ app/settings/
app/api/{transcribe,extract,nba,kb-ask,health}/route.ts
components/AppShell.tsx   側欄＋頂欄＋手機底部導覽｜components/ui.tsx｜components/charts.tsx
```

## 比賽日的 demo 路徑（動到任一步都要實際點過再 commit）
首頁 → 切主管視角 → 開始新會議 → 載入示範會議 → 知識庫提問 → 分析報表

## 六人協作規則
1. **只有整合者能碰 `main`**；其他人開自己的 branch
2. **檔案邊界不重疊**：一條線動會議相關頁面，另一條線做新頁面，避免 merge 衝突
3. `lib/types.ts` 是全隊共用的「合約」，要改欄位時同步更新 extract schema、pipeline normalizer、頁面 mapping
4. 衝突了找整合者，不要自己硬 merge
5. 每 30 分鐘 commit + push 一次（留下開發軌跡）

## 給 AI 的指令慣例
下指令時務必**指定參考檔案 ＋ 畫定修改範圍**，例如：
> 「參考 `app/meetings/[id]/page.tsx` 現有卡片的寫法，在每條 Next Best Action 旁加一個『生成 follow-up 信』按鈕，UI 風格與現有卡片一致，**只改這個檔案和新增的 API route，不要動其他檔案**。」

實測顯示 AI agent 傾向大範圍改檔案，**「不要動其他檔案」這句是防 merge 地獄的保命符**。
