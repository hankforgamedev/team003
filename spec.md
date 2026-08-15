# LINE／Google Calendar 進料規格（MVP）

## 這次只做什麼

把 LINE 新訊息與 Google Calendar 行程可靠地轉成純文字，寫到既有
`taoyuan-hsinchu2/async-pipeline/raw/`，交給既有 Async Pipeline／Bedrock 黑盒子繼續處理。

這次不做 Gmail、CRM 主檔、身份合併、知識庫 UI、查詢 API 或 DynamoDB。

```text
LINE webhook ─┐
              ├─ 驗證／正規化 ─ PipelineDocument ─ S3 async-pipeline/raw/*.txt ─ 既有黑盒子
Calendar poll ┘
```

## 共用輸出契約

每一筆來源事件輸出一個 `PipelineDocument`：

- `source`：`line` 或 `google-calendar`
- `externalId`：來源事件的穩定 ID，作為冪等依據
- `subjectId`：LINE 對話 ID 或 Calendar ID
- `occurredAt`：來源事件時間
- `body`：黑盒子可直接處理的 Markdown 純文字
- `metadata`：來源、方向、參與者、事件狀態等
- `deleted`：Calendar 取消事件的 tombstone 標記

S3 key 格式：

```text
async-pipeline/raw/{source}_{subjectId}_{YYYY-MM-DD}_{externalId}.txt
```

重送同一個事件只會覆寫同一個 key，不會重複觸發出多份知識。每事件一物件也避免
「讀整日檔案 → append → 寫回」的 S3 併發覆寫問題。

## LINE

### 真實資料路徑

1. LINE Platform 對 API Gateway `POST /webhooks/line`。
2. Lambda 使用未解析、未修改的 raw body 與 Channel Secret 驗證
   `X-Line-Signature`（HMAC-SHA256）。
3. 驗證失敗回 `401`，不寫任何資料。
4. `message` event 轉成文字後寫入 `async-pipeline/raw/`。
5. LINE 重送使用相同 `webhookEventId`，因此 S3 key 不變。

### 已知且不能假裝不存在的限制

- Messaging API 只能從 webhook 上線後收新訊息，不能拉取歷史對話。
- Webhook 是「客戶傳入官方帳號」的半邊對話。官方帳號透過程式送出的 reply／push
  必須在送出成功後呼叫 `lineOutboundMessageToDocument()` 才能補齊另一半。
- 若客服用 LINE Official Account Manager 人工回覆，Messaging API 沒有完整歷史拉取
  介面；需要另有人工匯出或改由統一客服發送入口記錄。
- 圖片／音訊目前只保留 message ID 與類型，不下載二進位內容。第一階段先驗證文字客戶
  對話，不讓媒體下載拖垮四十分鐘 MVP。

### 秘密與權限

- Channel Secret 放 Secrets Manager，不放 Git、前端或 Lambda 明文環境變數。
- Lambda 只需要：
  - `secretsmanager:GetSecretValue` 指定 Secret
  - `s3:PutObject` 到 `arn:aws:s3:::taoyuan-hsinchu2/async-pipeline/raw/*`
- 單測 inbound webhook 不需要 Channel Access Token。

## Google Calendar

- 第一次跑 `events.list` 全量同步並保存最後一頁的 `nextSyncToken`。
- 後續 EventBridge 每 15 分鐘帶 `syncToken`，只抓新增／修改／取消事件。
- 只有所有分頁都成功寫完，才更新 token；中途失敗會在下次安全重跑。
- Google 回 `410 Gone` 時，自動捨棄失效 token 並全量重同步。
- `syncToken` 放 `_ingestion-state/`，不放 `raw/`，避免誤觸發黑盒子。
- OAuth refresh token、client secret 必須放 Secrets Manager。程式已有 token provider 與
  增量同步核心；本輪四十分鐘真實驗收優先 LINE，Calendar 雲端 handler 留到下一輪。

## 四十分鐘真實 LINE 驗收

1. `npm ci && npm test && npm run build`
2. 建立 Secrets Manager Secret，內容：`{"channelSecret":"..."}`
3. 以 `deploy/line-webhook-template.yaml` 建立 Lambda＋HTTP API
4. 把輸出的 `LineWebhookUrl` 貼入 LINE Developers Console
5. 按 Verify，確認 `events: []` 收到 `200`
6. 用測試帳號傳「LINE 真實串接測試 2026-08-15」
7. 確認 S3 `async-pipeline/raw/line_*.txt` 出現該句
8. 確認既有 Async Pipeline 後續輸出仍正常

## 驗收定義

- 偽造或變造 webhook 不寫 S3。
- 同一 webhook 重送不新增第二個 S3 object。
- 中文、emoji、換行保留原樣。
- LINE Verify 空事件回 `200`。
- Calendar 分頁同步不漏資料，且 token 只在成功後推進。

## 客戶資料夾（最小路由層）

`async-pipeline/` 保留為既有黑盒子的內部工作區。當 LINE CRM JSON 產出後，
`customer-folder-router` 將同一筆資料的三種產物整理到 Bucket 根目錄：

```text
customers/<公司名>/line/raw/
customers/<公司名>/line/transcripts/
customers/<公司名>/line/crm/
```

LINE 身分對照儲存在 `async-pipeline/config/customer-map.json`。人工對照優先於
模型抽取的公司名稱；兩者都無法判斷時，資料依 LINE 身分的 SHA-256 匿名鍵分流至
`customers/_unassigned/contact-*/line/`。原始 LINE ID 不會出現在客戶資料夾名稱中。
