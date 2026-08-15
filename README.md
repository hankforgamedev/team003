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

## 核心設計：兩套完全獨立的分類系統

這是整個模組最重要的一個決定，也是所有 API 的前提。

**資料夾和標籤是兩套各自獨立的分類系統，不是同一份分類的兩種寫法。**

| | 回答的問題 | 一份知識可以有 | 未分類時 |
|---|---|---|---|
| 資料夾 `path` | 這是**什麼**文件 | 一個位置 | `null` → 未歸檔 |
| 標籤 `tags` | 這在講**什麼主題** | 多個標籤 | `[]` → 未標記 |

兩者**互不推導、互不同步**。改資料夾不會動到標籤，反之亦然。
所以一份知識有四種合法狀態：

```ts
{ path: '/公司知識/SOP', tags: ['報價'] }  // 兩套都分類了
{ path: '/公司知識/SOP', tags: [] }        // 只歸檔 → 標籤視角看不到
{ path: null, tags: ['報價'] }             // 只標籤 → 資料夾樹看不到
{ path: null, tags: [] }                   // 兩套都還沒分
```

### 這代表什麼

- **切換視角會看到不同的成員和不同的數量。** 這是正常的，不是知識不見了。
  UI 會在切換鈕上顯示各自的涵蓋率（例如「資料夾 5/6、標籤 5/6」），
  而且每套系統都有自己的未分類桶子（「未歸檔」／「未標記」）。
- **兩邊可能不一致，那是刻意允許的。** 模組不會幫你同步它們，
  只會把不一致顯示出來讓你知道還有幾筆沒分。
- **可以只用其中一套。** `mode='folder'` 或 `mode='tag'`，
  關掉的系統在 UI 上完全不出現，自動分類也不會去算它。

```tsx
<KnowledgeBase mode="folder" />  {/* 只用資料夾 */}
<KnowledgeBase mode="tag" />     {/* 只用標籤 */}
<KnowledgeBase />                {/* 預設 both */}
```

### 兩套分類器也是獨立的

自動分類是**兩個互不參考的分類器**，各自算把握度、各自給理由：

- `classifyIntoFolder()` — 判斷文件**種類**（SOP／FAQ／型錄）
- `classifyIntoTags()` — 判斷文件**主題**（報價／折扣／合約／退貨…）

兩邊的關鍵字刻意不重疊：「SOP」是文件種類，屬於資料夾系統，
**不會**變成主題標籤。所以常見的結果是一套猜得出來、另一套猜不出來 ——
那不是失敗，UI 會分開顯示讓使用者補上缺的那套。

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

// 一般文件 → 兩套分類系統各跑各的
const { doc, classification } = await ingest(store, markdownText);

classification.folder;  // { path, docType, confidence, reasons }
classification.tag;     // { tags, confidence, reasons }

// 會議 JSON → 自動辨識成客戶知識（貼字串或傳物件都可以）
await ingest(store, meetingJson);
// doc.path === '/客戶知識/沐日食品'
```

每套系統的 `reasons` 和 `confidence` 都要**分開顯示**在 UI 上 ——
自動分類必須是可解釋的，而且使用者常常只想確認其中一套
（同意 AI 的歸檔，但想自己改標籤）。文件上也是分開記錄的：
`autoFiled` 和 `autoTagged` 各自標示、各自確認。

猜不出來時**維持未分類**，不會塞進某個收件匣資料夾 ——
未歸檔是資料夾系統裡的一個合法狀態，不需要用假資料夾來代表它。

使用者明確指定其中一套時，另一套仍然照跑：

```ts
// 「我知道要放哪個資料夾，但標籤讓 AI 猜」
await ingest(store, text, { path: '/我的/自訂位置' });
// doc.path 是你指定的，doc.tags 仍然是 AI 標的

// 「這份不要進資料夾系統」
await ingest(store, text, { path: null });
```

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

1. `seedIfEmpty` 會自動灌入示範資料（5 份公司文件 + 1 場會議沉澱），
   刻意涵蓋四種分類狀態，所以獨立性在畫面上看得出來。
2. 切到「問答」，用內建的建議問題 —— 每一題都能在示範資料裡找到明確答案。
3. **點引文** —— 會跳回原文並 highlight 到正確的段落。這是最有說服力的一下。
4. 切到「匯入」，貼一段 SOP 文字，看**兩套分類器各自**給出結果和理由。
5. 在「瀏覽」切換資料夾／標籤視角，指出兩邊的成員和涵蓋率不一樣，
   再點「未歸檔」「未標記」桶子，說明每套系統各自管自己的未分類。
6. 頂端「重設示範資料」可以隨時回到乾淨狀態。

---

## 現況

已驗證（`npm test`，35 項全過）：

- 路徑正規化、`null` 不會被當成根目錄、資料夾樹（含中間層不斷裂）、
  未歸檔不混進樹、搬資料夾不碰未歸檔的
- 中文斷詞、中英數混合
- 兩個分類器互不干涉、標籤詞彙不含文件種類詞、
  一套猜得到另一套猜不到是合法結果、`mode` 只啟用一套、
  指定一套不會清掉另一套的自動結果
- **四種分類狀態都成立、兩個視角成員可以完全不同、
  每套系統有自己的未分類桶子、涵蓋率各算各的、改一套不動另一套**
- 會議 JSON 沉澱（含原話保留、預算格式化）與字串自動辨識、
  單一系統模式下的行為
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
- **兩套系統獨立的代價是可能都沒分類**：一份知識可以既沒歸檔也沒標籤，
  這時它只出現在兩個未分類桶子裡。模組不會強迫你分類，
  但涵蓋率會一直顯示在切換鈕上提醒你。
