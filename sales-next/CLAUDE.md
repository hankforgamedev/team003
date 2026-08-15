# Sales Next — 團隊 AI 開發守則（hackathon 版）

給所有 AI coding 工具（Claude Code / Cursor）的專案脈絡。改 code 前先讀完。

## 產品一句話
給臺灣 B2B 中小企業 Sales Team 的 AI Sales Assistant：會議錄音 → 逐字稿 → 自動建 CRM → 知識庫問答 → 漏斗分析 → Next Best Action。核心 wow moment：**開完會，AI 直接告訴你下一步怎麼做，而且每條建議附自家數據依據**。

## 技術棧與慣例
- Next.js 15 App Router＋TypeScript＋Tailwind v4（tokens 在 `app/globals.css` 的 `@theme`）；繁體中文 UI；圖表手刻 SVG，不引圖表庫
- 狀態：zustand＋localStorage（`lib/store.ts`）；**沒有資料庫**，這是刻意的（離線 demo 保險）
- AI：OpenAI（Whisper＋gpt-5.6-terra），全部集中在 `lib/ai/openai.ts`；每個 AI 功能都有離線備援（`lib/ai/demo-engine.ts`、`nba-rules.ts`），**新功能也必須遵守「API 掛掉要能降級」**
- 分析數字一律從案件資料推導（`lib/data/analytics.ts`），**禁止寫死統計數字**——這是 demo 禁得起檢驗的關鍵

## 檔案地圖
- `lib/types.ts` 資料模型（Deal/Meeting/MeetingExtraction/NBA）
- `lib/data/generator.ts` 確定性母體（520 筆，固定 seed）｜`showcase.ts` 手工重點案件＋示範會議腳本
- `app/meetings/new/page.tsx` wow moment 流程（四種輸入＋四階段動畫）
- `app/api/{transcribe,extract,nba,chat,health}` server 端 AI

## 鐵律
1. 比賽日 demo 路徑（首頁→主管視角→新會議→示範會議→知識庫→分析）**動到任何一步都要實際點過再 commit**
2. `.env.local` 永不進 git；key 只放 Vercel env
3. 部署後要重綁網址：`vercel alias set <新部署URL> sales-next-tw.vercel.app`
4. 改 `generator.ts`/`showcase.ts` 的人要確認 funnel 數字仍自洽（黃金客群＝品牌方＋年約 ≈21 天）
5. 一人當整合者管 main；其他人開 branch，衝突找整合者，不要硬 merge
