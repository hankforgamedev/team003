# Sales Next Knowledge Base — AWS 組交接單

這份文件給負責 AWS 帳號、IAM 與部署環境的同事使用。目標是讓伺服器端程式能：

1. 用 S3 保存知識庫 JSON。
2. 透過 Amazon Bedrock 呼叫 Claude Sonnet 4.5 回答問題。
3. 透過 Amazon Titan Text Embeddings V2 產生向量。
4. 執行一次真實整合測試，並在測試結束後刪除暫存物件。

> AWS 憑證只能由伺服器端的 IAM role／AWS credential provider chain 取得。不要把 Access Key、Secret Key 或 Session Token 寫進 repository、前端 bundle、映像檔或部署變數範本。

## AWS 組今天要完成的項目

- [ ] 準備一個位於 `us-east-1` 的 S3 bucket。
- [ ] 啟用 S3 Block Public Access、版本控制與預設加密。
- [ ] 建立或指定應用程式的 IAM execution role。
- [ ] 把下方最小權限 policy 附加到 execution role。
- [ ] 確認帳號可使用 Claude Sonnet 4.5 與 Titan Text Embeddings V2。
- [ ] 確認 SCP 不會封鎖 Bedrock US inference profile 的目的地區域。
- [ ] 把環境變數交給部署平台，不透過聊天或 Git 傳遞長期憑證。
- [ ] 執行 `npm run test:aws`，保留成功輸出作為驗收紀錄。

## 架構與責任邊界

```text
Browser
  │ HTTPS（不含 AWS 憑證）
  ▼
Server / Lambda / ECS task
  ├─ S3: knowledge-base.json
  ├─ Bedrock: Claude Sonnet 4.5 US inference profile
  └─ Bedrock: Titan Text Embeddings V2
```

AWS SDK 使用預設 credential provider chain。正式環境優先使用 Lambda execution role、ECS task role 或 EC2 instance profile；CI 可使用 GitHub OIDC。不要為應用程式建立長期 IAM user access key。

## 部署參數

| 參數 | 建議值 | 用途 |
| --- | --- | --- |
| `AWS_REGION` | `us-east-1` | S3 與 Bedrock client 的來源區域 |
| `KB_S3_BUCKET` | `<BUCKET_NAME>` | 真實整合測試使用的既有 bucket |
| `KB_S3_KEY` | 不設定 | 測試預設建立唯一的 `codex-integration-tests/...` key |
| `BEDROCK_CLAUDE_MODEL` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Sonnet 4.5 US geographic inference profile |
| `BEDROCK_EMBED_MODEL` | `amazon.titan-embed-text-v2:0` | Titan V2 embedding model |
| `KEEP_AWS_TEST_OBJECT` | 不設定 | 只有除錯時才設為 `1`；正式驗收不可設定 |

`AWS_DEFAULT_REGION` 也能供整合測試腳本使用，但部署環境統一設定 `AWS_REGION`，避免 SDK 與 shell 行為不一致。

正式應用程式建立 store 時應固定 production key：

```ts
const store = new S3Store({
  bucket: process.env.KB_S3_BUCKET!,
  key: 'knowledge-base.json',
  region: process.env.AWS_REGION!,
  ifMatch: true,
});
```

## IAM 最小權限

把 `<ACCOUNT_ID>` 與 `<BUCKET_NAME>` 替換成實際值。這是 permissions policy，不是 role trust policy；trust policy 請依 Lambda、ECS、EC2 或 GitHub OIDC 的實際執行主體設定。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KnowledgeBaseObjectReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/knowledge-base.json"
    },
    {
      "Sid": "IntegrationTestObjectLifecycle",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/codex-integration-tests/*"
    },
    {
      "Sid": "Sonnet45CrossRegionProfile",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1:<ACCOUNT_ID>:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    },
    {
      "Sid": "Sonnet45DestinationModels",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0",
        "arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0",
        "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0"
      ],
      "Condition": {
        "StringEquals": {
          "bedrock:InferenceProfileArn": "arn:aws:bedrock:us-east-1:<ACCOUNT_ID>:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        }
      }
    },
    {
      "Sid": "TitanEmbedding",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"
    }
  ]
}
```

補充：

- 現有程式使用非串流呼叫，所以不需要 `bedrock:InvokeModelWithResponseStream`。
- 正式 runtime role 不需要跑整合測試時，可移除 `IntegrationTestObjectLifecycle`，改由 CI／驗收 role 持有。
- 不需要 `s3:ListAllMyBuckets` 或 `s3:ListBucket`；程式已知 bucket 與 object key。
- 若 bucket 強制使用 SSE-KMS，還要依實際 key policy 加入 `kms:Decrypt`、`kms:GenerateDataKey`，並把 Resource 限定為該 KMS key ARN。

## S3 建議設定

- Block Public Access：四項全部開啟。
- Object Ownership：Bucket owner enforced；ACL 關閉。
- Versioning：開啟，避免正式 JSON 被誤覆寫後無法還原。
- Default encryption：SSE-S3 即可；有組織規範再改 SSE-KMS。
- CORS：不需要。瀏覽器不應直接存取此 bucket。
- Lifecycle：對 `codex-integration-tests/` 設定 1–7 天到期，並清除 noncurrent versions 與 expired delete markers。版本控制開啟時，`DeleteObject` 會留下非現行版本，這條規則是必要的成本保險。

## Bedrock 前置檢查

1. 在帳號中確認 Claude Sonnet 4.5 與 Titan Text Embeddings V2 可呼叫；若 AWS Marketplace／model access 尚未完成，先處理訂閱或授權。
2. Sonnet 使用 `us.` geographic cross-region inference profile。來源為 `us-east-1`，AWS 可能把請求路由到 `us-east-1`、`us-east-2` 或 `us-west-2`。
3. 組織 SCP、permission boundary 與 VPC endpoint policy 必須允許上述所有目的地 model ARN；只要其中一個目的地被 SCP 封鎖，profile 呼叫就可能失敗。
4. 若使用 Bedrock VPC interface endpoint，另外確認 DNS、security group 與 endpoint policy 允許 Runtime API。

## 驗收方式

在已取得 execution role／短期 session credentials 的 PowerShell 執行：

```powershell
$env:AWS_REGION = 'us-east-1'
$env:KB_S3_BUCKET = '<BUCKET_NAME>'

npm ci
npm run typecheck
npm test
npm run test:aws
```

成功標準：

```text
✓ S3Store 真實寫入與讀回成功
✓ Claude 真實回答成功
✓ Titan embedding 成功（1024 維）
✓ AWS 真實整合測試全部通過
✓ 已刪除測試物件
```

測試使用每次唯一的 `codex-integration-tests/<日期>/<UUID>.json`，不會碰 `knowledge-base.json`。除非正在調查失敗，否則不要設定 `KEEP_AWS_TEST_OBJECT=1`。

## 常見錯誤

| 訊息／現象 | 優先檢查 |
| --- | --- |
| `NoCredentialsProvider` / 找不到 credentials | execution role 是否真的掛在執行環境；本機 profile/session 是否仍有效 |
| `AccessDeniedException`（Sonnet） | inference profile ARN、三個目的地 model ARN、SCP、permission boundary |
| 模型不可用／Marketplace 403 | 帳號的 model access、Marketplace entitlement 與付款設定 |
| `AccessDenied`（S3） | bucket 名稱、object prefix、bucket policy、KMS key policy |
| `NoSuchKey`（第一次讀取） | 對全新測試 key 是正常狀態，程式會視為空知識庫 |
| `PreconditionFailed` | `ifMatch` 樂觀鎖偵測到同時修改；重新讀取最新版後再寫入 |
| 測試物件未刪除 | 手動刪除該 UUID key，並檢查 `s3:DeleteObject`；lifecycle 會作最後保險 |

## Definition of Done

- [ ] 應用程式的 role 無長期 access key。
- [ ] IAM policy 沒有 `Action: "*"` 或 `Resource: "*"`。
- [ ] S3 bucket 不公開、已加密、已開版本控制。
- [ ] `npm run test:aws` 五個成功標記全部出現。
- [ ] `codex-integration-tests/` 下沒有本次驗收的現行物件；非現行版本已受 lifecycle 管理。
- [ ] 憑證、account ID、真實 bucket 名稱沒有進 Git。

## 官方依據

- [Amazon Bedrock geographic cross-Region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)
- [Amazon Bedrock IAM policy examples](https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples.html)
- [Claude Sonnet 4.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html)
- [Amazon Titan Text Embeddings models](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
- [Amazon S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [Amazon S3 default encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html)
- [How Amazon S3 works with IAM](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html)
