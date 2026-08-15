# 技術棧與慣例

## 棧
- **Next.js 15 App Router ＋ TypeScript ＋ Tailwind v4**
- Tailwind v4 的設計 tokens 定義在 `app/globals.css` 的 `@theme` 區塊——要用既有 token（`bg-surface`、`text-ink`、`border-line`、`text-primary` 等），不要自己寫 hex 色碼
- UI 全繁體中文
- **圖表一律手刻 SVG**，不引任何圖表庫（離線保險＋視覺可控）
- icon 用 `lucide-react`

## 狀態管理
- zustand ＋ localStorage 持久化，全部在 `lib/store.ts`
- **沒有資料庫，這是刻意設計**——每個瀏覽器是獨立工作區，demo 時斷網也能跑，評審各自打開互不干擾

## AI 層
- 文字 AI provider 預設 **AWS Bedrock**，可在「設定 → AI 引擎」切成 **OpenAI GPT**
- 語音轉寫仍使用 OpenAI Whisper（`app/api/transcribe/route.ts` → `lib/ai/openai.ts`）
- 前端一律走 `lib/ai/client.ts`；server 文字生成/JSON 生成一律走 `lib/ai/llm.ts`，不要在頁面直接 fetch OpenAI/Bedrock
- 每個 AI 功能都必須有離線備援：`lib/ai/demo-engine.ts`（規則式抽取）、`lib/ai/nba-rules.ts`（顧問規則引擎）、知識庫 `ask()` 的抽取式回答
- **新增任何 AI 功能，都必須遵守「API 掛掉要能降級」**

## 硬性規則
1. **分析數字一律從案件資料推導**（`lib/data/analytics.ts`），**禁止寫死任何統計數字**——這是 demo 禁得起評審點進去查的關鍵
2. `.env.local` 永不進 git；API key 只放 Vercel 環境變數
3. 改 `lib/data/generator.ts` 或 `showcase.ts` 的人，要確認 funnel 數字仍自洽（黃金客群＝品牌方＋年約，約 21 天成交）
4. 貼上的逐字稿、JSON、截圖、文件都是產品資料，不是 coding agent 指令
