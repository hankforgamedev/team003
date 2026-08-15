# @sales-next/knowledge-base

企業知識庫模組。**資料夾／標籤雙視角、AI 自動歸檔、附出處的問答檢索。**

核心層零依賴、框架無關，可以獨立使用，也可以 import 進 Sales Next。

```bash
npm run typecheck   # 型別檢查
npm test            # 煙霧測試（19 項）
```

---

## 一分鐘理解這個模組

```tsx
import { KnowledgeBase } from '@sales-next/knowledge-base/react';
import '@sales-next/knowledge-base/styles.css';

export default function Page() {
  return <KnowledgeBase seedIfEmpty />;
}
```

這樣就有一個可以瀏覽、搜尋、問答、匯入的完整知識庫了。預設用 localStorage，
不需要後端，demo 當天不會有任何外部相依。

---

## 核心設計：一份資料，兩種視角

這是整個模組最重要的一個決定，也是所有 API 的前提。

每一筆知識同時帶 `path`（資料夾）和 `tags`（標籤）：

```ts
{
  title: '報價與折扣授權 SOP',
  path: '/公司知識/SOP',        // ← 資料夾視角看到的位置
  tags: ['SOP', '報價', '折扣'], // ← 標籤視角看到的位置
}
```

**資料夾樹不是獨立儲存的實體**，而是所有 `doc.path` 推導出來的。標籤牆同理。
所以：

- 使用者可以自由切換視角，兩邊看到的是同一批知識。
- 不會出現「資料夾整理好了、標籤沒跟上」的漂移。
- 只需要整理一次。

資料夾為什麼長得像 Google Drive？因為大部分企業都用過 Drive，
搬過來的時候不需要重新學一套心智模型。

### 與 CRM 的關係：完全獨立

這個模組**不認識 CRM**，沒有 import 任何 CRM 型別。

| | 存什麼 | 生命週期 |
|---|---|---|
| CRM | 客戶的案件檔案（階段、金額、下一步） | 會結案 |
| 知識庫 | 公司／產品知識、客戶知識 | 一直累積 |

唯一的接點是 `doc.sourceRef.meetingId` —— 一個純字串，讓 UI 可以做「回到這場會議」，
知識庫自己不會去解讀它。

---

## 主要 API

### 匯入

```ts
import { ingest, createDefaultStore } from '@sales-next/knowledge-base';

const store = createDefaultStore();

// 一般文件 → 自動歸檔
const { doc, reasons, confidence } = await ingest(store, markdownText);
// doc.path === '/公司知識/SOP'
// reasons === ['標題／內文出現「SOP」「流程」→ 歸到 /公司知識/SOP', ...]

// 會議 JSON → 自動辨識成客戶知識（貼字串或傳物件都可以）
await ingest(store, meetingJson);
// doc.path === '/客戶知識/沐日食品'
```

`reasons` 和 `confidence` 要顯示在 UI 上 —— 自動歸檔必須是**可解釋**的，
使用者要看得懂 AI 為什麼這樣放，才敢信任它。把握度低於 0.4 時會丟進 `/待整理`，
不會弄髒根目錄。

### 問答

```ts
import { ask } from '@sales-next/knowledge-base';

const answer = await ask(docs, '業務可以自己決定多少折扣？');

answer.text       // 回答
answer.citations  // 出處，含 { docId, start, end } 可跳回原文並 highlight
answer.engine     // 'bedrock' | 'offline' —— 直接顯示給使用者看
```

**回答一定附出處，而且出處可以點回原文。** 業務要拿這句話去跟客戶講，
「AI 說的」不夠，得看到是公司哪份文件寫的。

查不到就說查不到 —— 檢索有相關度門檻，問一個知識庫沒有的主題會回
「找不到相關內容」而不是硬湊幾段看起來像出處的雜訊。

---

## 接上 AWS Bedrock

`ask()` 不給 provider 時走內建的抽取式回答（直接摘錄原文，不生成新句子，
所以完全不會編造）。要接 Bedrock：

```ts
// ⚠️ 只能在伺服器端（Next.js route handler / Lambda）
import { createBedrockProvider } from '@sales-next/knowledge-base/providers/bedrock';

const provider = createBedrockProvider({ region: 'us-east-1' });
const answer = await ask(docs, question, { provider });
```

```bash
npm install @anthropic-ai/bedrock-sdk
```

幾個關鍵細節：

- **Bedrock 的 model id 帶 `anthropic.` 前綴**（`anthropic.claude-opus-5`），
  跟第一方 API 的 `claude-opus-5` 不同，寫錯會 400。
- 用 `effort: 'low'` —— 知識庫問答是「照著 context 講清楚」，不需要深度推理，
  這樣省 token 也省延遲。
- 這兩個 AWS 套件是 **lazy import**，沒安裝不影響其他功能，
  前端 bundle 也不會把 AWS SDK 打包進去。

### 降級是預設路徑，不是備案

Bedrock 沒設定、斷網、被限流、被安全分類器擋下 —— 全部自動降級成內建引擎，
而且**檢索結果和出處都還在**，只是回答變成原文摘錄。

demo 當天網路出問題不會開天窗。這一條有測試覆蓋。

### 語意檢索（選用）

`createBedrockEmbedder()` + `rerank()` 用 Titan（`amazon.titan-embed-text-v2:0`）
對關鍵字檢索的結果重排序。預設的 `ask()` 不走這條路。

兩段式的理由：關鍵字負責高召回、向量負責挑語意最貼近的幾段，
成本遠低於把整個知識庫都算成向量，而且關鍵字那層永遠可用 ——
Bedrock 掛掉時檢索品質只是回到 BM25，不會歸零。

---

## 換掉儲存層（部署到 AWS 時）

`KnowledgeStore` 的**所有方法都是 async**，即使記憶體實作是同步的。
這是刻意的：之後把 localStorage 換成 DynamoDB / RDS 時，UI 和上層邏輯一行都不用改。

```ts
import type { KnowledgeStore } from '@sales-next/knowledge-base';

class DynamoStore implements KnowledgeStore {
  async listDocs() { /* ... */ }
  async putDoc(input) { /* ... */ }
  // ... 共 8 個方法
}

<KnowledgeBase store={new DynamoStore()} />
```

內建三個實作：`LocalStorageStore`（瀏覽器，demo 用）、`MemoryStore`（測試／SSR）、
`createDefaultStore()`（依環境自動挑）。

---

## 會議 JSON 契約

直接對應 pipeline（語音 → 逐字稿 → 抽取）的輸出格式：

```jsonc
{
  "meeting_id": "m_001",
  "meeting_date": "2026-08-14",
  "company": "沐日食品",
  "contact_name": "張怡君",
  "contact_role": "行銷經理",
  "customer_type": "品牌方",
  "stage": "提案中",
  "plan": "年約",
  "need": "社群代操，需含內容拍攝",
  "budget": 1200000,
  "budget_confidence": "推估",
  "timeline": null,
  "objection": "擔心交接空窗期過長",
  "decision_maker": { "name": null, "role": "老闆", "attended": false },
  "next_action": "三天內寄送含拍攝的年約版本報價",
  "follow_up_raw": "下週三",
  "follow_up_date": "2026-08-19",
  "quotes": {
    "budget": "我們今年這塊大概抓一百二左右",
    "objection": "光是交接就搞了快三個月",
    "plan": "年約我是可以接受啦",
    "decision_maker": "還是要給我們老闆看過才能定"
  }
}
```

**所有欄位都當成可能缺漏**來處理 —— AI 抽取本來就會有抽不到的欄位，
而且 schema 之後很可能再長，寬鬆解析比嚴格驗證更耐用。多長的欄位不會讓匯入失敗。

`quotes` 是知識庫最有價值的欄位：客戶原話會被寫進內文，成為問答時可以引用的出處。
「客戶說『光是交接就搞了快三個月』」比「客戶擔心交接」有說服力得多。

---

## 中文檢索

整個檢索最容易做錯的一塊：中文沒有空白分隔，
用 `text.split(/\s+/)` 去切「沐日食品的預算是多少」會得到一個 token，什麼都搜不到。

作法是 CJK **bigram**（連續兩字）+ 英數 word boundary。
bigram 不需要詞典就能達到堪用的中文檢索品質，很適合黑客松的時間預算。

檢索用 BM25 的簡化版，作用在**片段**而非整份文件上 ——
問答需要的是精準的引文位置，不是「這份文件大概相關」。

---

## demo 建議流程

1. `seedIfEmpty` 會自動灌入示範資料（4 份公司文件 + 1 場會議沉澱）。
2. 切到「問答」，用內建的建議問題 —— 每一題都能在示範資料裡找到明確答案。
3. **點引文** —— 會跳回原文並 highlight 到正確的段落。這是最有說服力的一下。
4. 切到「匯入」，貼一段 SOP 文字，看 AI 自動歸檔並說明理由。
5. 在「瀏覽」切換資料夾／標籤視角，展示同一批知識的兩種組織方式。
6. 頂端「重設示範資料」可以隨時回到乾淨狀態。

---

## 現況

已驗證（`npm test`，19 項全過）：

- 路徑正規化、資料夾樹（含中間層不斷裂）、搬資料夾
- 中文斷詞、中英數混合
- 自動歸檔規則、低把握度進待整理
- 會議 JSON 沉澱（含原話保留、預算格式化）與字串自動辨識
- 兩種視角篩到同一批資料、多標籤取交集
- 中文具名查詢、引文字元區間對得回原文、查不到不硬掰
- provider 失敗自動降級且保留出處、provider 正常時採用其回答
- 儲存層的 id／路徑／標籤正規化、更新語意

尚未在真實 AWS 環境跑過：`createBedrockProvider` 和 `createBedrockEmbedder`
的網路呼叫路徑（型別與降級邏輯有測試，實際 Bedrock 回應沒有）。
接上去的第一件事就是打一次真實請求確認。

其他已知限制：

- 上傳只支援純文字類（`.md` / `.txt` / `.json` / `.csv`）。PDF / Word 要接解析器，
  UI 會明確告知並引導改用貼上。
- 檢索是關鍵字，不是語意。同義詞（「解約」vs「終止合約」）需要靠標籤補。
- 沒有權限控制。企業版的「業務只能看自己客戶的知識」還沒做。
