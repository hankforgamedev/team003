# Sales Next Feature Plan

這份文件放「接下來要開的洞」，讓下一個 coding agent 不用重新猜資料邊界。

## 近期目標

要新增兩個資料源：

1. LINE 常駐資料庫：純文字檔案為主，當作長期訊息/知識記憶。
2. 潛在用戶資料庫：比較複雜的結構化 lead/prospect 資料，之後會支援搜尋、評分、轉成正式案件。

重點：兩者不要混在同一個 store。LINE 是「文字記憶」，潛在用戶是「結構化商機資料」。最後可以一起餵給 AI，但資料模型和生命週期分開。

## 建議檔案位置

```text
sales-next/
  data/
    line/                    # LINE 純文字資料，demo/本機用
    prospects/               # 潛在用戶 JSON/fixture，若先不接真 DB
  lib/data-sources/
    types.ts                 # LineThread / LineMessage / Prospect 型別
    line-text-store.ts       # LINE 純文字讀取與搜尋
    prospects-store.ts       # 潛在用戶資料存取介面
    local-prospects-store.ts # 先用 JSON/localStorage 的實作
```

如果之後要接真正 DB，保留 `prospects-store.ts` 介面不動，只換實作。

## LINE 常駐資料庫

### 人話定義

LINE 資料庫是一批常駐純文字檔案，記錄長期對話、客戶常問內容、群組脈絡或業務線索。它比較像知識庫素材，不像 CRM 案件。

### 初版資料格式

建議一個 thread 一個 `.txt` 或 `.md`：

```text
data/line/
  threads/
    line-thread-001.txt
    line-thread-002.txt
```

內容可以先接受鬆散格式：

```text
[2026-08-14 10:03] 客戶 王小姐：請問你們有支援 ERP 串接嗎？
[2026-08-14 10:05] 業務 張予安：可以，我們目前支援 API 匯出與客製 webhook。
[2026-08-14 10:08] 客戶 王小姐：那我們下週可以約 demo。
```

### 建議型別

```ts
export interface LineThread {
  id: string;
  title: string;
  sourcePath: string;
  participants: string[];
  messages: LineMessage[];
  updatedAt?: string;
}

export interface LineMessage {
  id: string;
  threadId: string;
  sentAt?: string;
  sender: string;
  text: string;
}
```

### Store 介面

```ts
export interface LineTextStore {
  listThreads(): Promise<LineThread[]>;
  getThread(id: string): Promise<LineThread | null>;
  searchText(query: string): Promise<LineMessage[]>;
}
```

### 可先做的功能

- `/line` 或 `/sources/line` 頁面：瀏覽 thread、全文搜尋。
- 新會議 pipeline 可以把 LINE 搜尋結果當補充 context。
- 知識庫可以把 LINE thread ingest 成客戶知識或公司知識。
- CRM 案件頁可以顯示與該公司/窗口相關的 LINE 摘要。

## 潛在用戶資料庫

### 人話定義

潛在用戶資料庫是 lead/prospect pool。它不是已成立案件，也不是會議紀錄，而是可能成交的公司/窗口清單，包含來源、資格、需求、互動狀態、AI 評分與下一步。

### 建議型別

```ts
export type ProspectStatus =
  | "new"
  | "researching"
  | "contacted"
  | "qualified"
  | "nurturing"
  | "converted"
  | "disqualified";

export interface Prospect {
  id: string;
  company: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  lineThreadIds?: string[];
  industry?: string;
  location?: string;
  companySize?: string;
  source: "LINE" | "官網詢問" | "活動名單" | "客戶轉介" | "手動建立" | "匯入";
  status: ProspectStatus;
  painPoints?: string[];
  interestSignals?: string[];
  budgetHint?: string;
  fitScore?: number;
  urgencyScore?: number;
  owner?: string;
  lastInteractionAt?: string;
  nextAction?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Store 介面

```ts
export interface ProspectStore {
  list(): Promise<Prospect[]>;
  get(id: string): Promise<Prospect | null>;
  upsert(prospect: Prospect): Promise<void>;
  search(query: string): Promise<Prospect[]>;
  updateStatus(id: string, status: ProspectStatus): Promise<void>;
}
```

### 可先做的功能

- `/prospects` 頁面：列表、搜尋、狀態篩選、fit/urgency 排序。
- `/prospects/[id]` 頁面：公司/窗口/互動紀錄/AI 建議下一步。
- 「轉成案件」按鈕：把 qualified prospect 轉成 `Deal`，但不要刪掉原 prospect。
- 新會議頁可以從 prospect 預填 `company`、`contact_name`。
- 分析頁可以加「潛在用戶 → 案件」轉換率，但數字仍要從資料推導，不要寫死。

## 實作順序

1. 新增 `lib/data-sources/types.ts`，先定資料合約。
2. 新增 `line-text-store.ts`，能讀 demo text fixture 並做基本搜尋。
3. 新增 `prospects-store.ts` 介面與 `local-prospects-store.ts` demo 實作。
4. 補 `/prospects` 列表頁，不接 AI，先讓資料可見。
5. LINE thread ingest 到 knowledge-base，讓 KB 問答能引用 LINE 原文。
6. 新會議頁加「從潛在用戶帶入」入口。
7. AI 對 prospect 做 fit/urgency/next action 分析，仍要 fallback。

## 不要現在就做的事

- 不要直接引入大型 CRM 或登入系統。
- 不要把 LINE 純文字和 Prospect 混進 `lib/store.ts` 的同一個大物件。
- 不要把 API key 或真實 LINE 匯出檔 commit。
- 不要在前端直接讀 server 檔案；如果要讀 `data/line`，透過 server route 或 build-time fixture adapter。
- 不要寫死「潛在用戶數量、轉換率、分數」等統計。

## 跟現有系統的接點

- `lib/store.ts`：正式轉成 Deal/Meeting 時才寫入這裡。
- `lib/kb/adapter.ts`：LINE 或 Prospect 摘要要進知識庫時，在這裡轉成 knowledge doc。
- `lib/ai/client.ts` / `lib/ai/llm.ts`：AI 分析 prospect 時仍走現有 provider/fallback 架構。
- `app/meetings/new/page.tsx`：從 prospect 預填基本資料，最後仍走既有 pipeline。
- `lib/data/analytics.ts`：如果要加 prospect funnel，新增純函式從 prospect 資料推導。

## 驗收標準

- 沒有 key、沒網路時，LINE 搜尋和 prospect 列表仍可用。
- OpenAI/Bedrock 掛掉時，AI 分析降級，不影響資料瀏覽。
- `.env.local`、真實 LINE 匯出、真實客戶名單不進 git。
- `npm run build` 成功。
- 既有 demo path 不壞：首頁 → 主管視角 → 新會議 → 載入示範會議 → 知識庫 → 分析報表。
