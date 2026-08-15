# Sales Next

**開會後，下一步就清楚了。**

給臺灣 B2B 中小企業 Sales Team 的 AI 銷售助理：會議錄音 → 逐字稿 → 自動建 CRM → 知識庫問答 → 漏斗分析 → **Next Best Action**。

🔗 **線上 Demo（免登入）**：https://sales-next-tw.vercel.app

> 一般會議 AI 告訴你「剛剛說了什麼」；Sales Next 告訴業務「**接下來該做什麼**」——而且每條建議都附得出資料依據。

---

## 核心功能

| 功能 | 說明 |
|---|---|
| 🎙️ 會議輸入 | 即時錄音 / 上傳音檔 / 貼上逐字稿 / 載入示範會議；錄音前內建個資法告知流程 |
| 🤖 自動建 CRM | Whisper 轉寫 → GPT 抽取 13 個欄位（公司、窗口、預算、階段、異議、決策者、下一步…） |
| ✨ Next Best Action | 顧問方法論規則引擎 × 企業自家歷史數據 × LLM 潤飾，每條建議附「為什麼」 |
| 📖 Sales Knowledge Base | 跨會議問答，答案附出處引文，可跳回原始會議 |
| 🔻 銷售漏斗 | 五階段轉換率、瓶頸自動判定、依客群/方案分組比較 |
| 📈 黃金客群分析 | 成交週期 × 客戶類型 × 方案，找出最值得投入的客群 |
| 📱 PWA | 響應式，手機加入主畫面即獨立 App |

## 技術架構

```
Meeting Audio → Whisper STT → GPT 結構化抽取 → CRM Database
                                                    ├→ Knowledge Base (RAG)
                                                    ├→ Sales Analytics
                                                    └→ 規則引擎 × 歷史數據 → Next Best Action
```

- **Next.js 15**（App Router）＋ TypeScript ＋ Tailwind v4
- **zustand + localStorage**：每個瀏覽器一個獨立工作區，無需登入即可完整體驗
- **雙引擎設計**：所有 AI 功能都有離線備援（規則式抽取、檢索式問答、本地規則引擎），API 失效或斷網時自動降級，功能不中斷
- **數據自洽**：520 筆確定性生成的示範案件，所有統計即時推導，無寫死數字
- 手刻 SVG 圖表，零圖表相依

## 本機執行

```bash
npm install
npm run dev
```

開 http://localhost:3000 即可（無需 API key，會以內建示範引擎運作）。

要啟用真 AI，建立 `.env.local`：

```
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
```

目前本機測試版的 Whisper 轉寫、GPT 結構化抽取、Next Best Action 潤飾、知識庫問答都走 OpenAI API；
AWS Bedrock 知識庫 provider 已暫時切成 OpenAI，方便用同一把 key 測完整 pipeline。

## 專案結構

```
app/            頁面（總覽/會議/案件/知識庫/漏斗/分析/設定）＋ API routes
lib/types.ts    資料模型（Deal / Meeting / MeetingExtraction / NBA）
lib/ai/         OpenAI 呼叫層、離線備援引擎、NBA 規則引擎
lib/data/       示範資料生成器、重點案件、分析函式
CLAUDE.md       給 AI coding 工具的專案守則
```

---

2026 Build with AI Hackathon（NTU Ventures）參賽作品。
