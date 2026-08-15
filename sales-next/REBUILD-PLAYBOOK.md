# 當天重建作戰手冊（若規則要求現場從零寫 code）

> 前提：先向主辦方確認「賽前 code」規定。若允許帶舊 code → 忽略本文件，當天做加分功能。
> 若要求現場寫 → 照本手冊。spec、設計、prompt、示範資料內容通常不算 code，可以帶。

## 原則
- 這份 repo 是「已驗證的藍圖」：架構、資料模型、prompt、示範逐字稿都想清楚了，現場只是重打一次
- 3 條平行線＋1 個整合者；每條線一個人操作 AI＋一個人盯 diff 與實測（pair）
- 每 30 分鐘 push 一次（留 commit 軌跡自證「現場寫的」）；比 deadline 提早 90 分鐘 feature freeze 開始排練

## 開賽前 10 分鐘（整合者）
1. 開新 repo（現場建，保時間戳）→ `npx create-next-app@latest --ts --tailwind --app`
2. 貼入 CLAUDE.md（本 repo 的可先印出／放共用 Doc）
3. `vercel link && vercel deploy` 先通部署管線，之後每小時部署一次

## 三條平行線（模組邊界＝檔案邊界，不會衝突）
- **Line A｜外殼＋儀表板**：`lib/types.ts` → `lib/data/generator.ts`＋`analytics.ts` → `components/AppShell` → 首頁雙視角。提示詞開頭：「照以下 data schema 與設計 tokens…」（schema 從舊 repo 的 types.ts 抄進 prompt——schema 是 spec）
- **Line B｜會議管線**：`app/api/*`（transcribe/extract/nba/health）→ `lib/ai/*`（含離線備援＋規則引擎）→ `meetings/new` 四階段流程。示範逐字稿內容直接帶（內容不是 code）
- **Line C｜分析三頁**：funnel／analytics／knowledge＋deals 列表。依賴 Line A 的 types＋analytics，開賽 1 小時後起跑，前 1 小時先做 pitch 素材與測試腳本
- **整合者**：只管 main、部署、解衝突、每小時整體點測一輪 demo 路徑

## 時程（假設 8 小時賽制，按比例縮放）
| 時間 | 里程碑 |
|---|---|
| +1h | 部署管線通、types＋generator 合入、外殼可見 |
| +3h | 儀表板有數字；extract API 通（真 AI） |
| +5h | wow moment 全流程通；分析頁齊 |
| +6.5h | **feature freeze**；只修 bug；開始排練 |
| +7h | 完整排練 ×2＋錄備援影片 |

## 翻車保險
- AI 額度：兩把 key（主/備）；瀏覽器多開帳號
- 網路：手機熱點兩支；Vercel 掛掉→ `npm run dev` 本機 demo（產品本來就離線可跑）
- merge 地獄：模組邊界＝檔案邊界；跨檔改動只有整合者能做
