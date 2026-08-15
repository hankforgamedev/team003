# AI Sales Assistant CRM 案件欄位 Schema

> 研究基礎：Salesforce Account/Contact/Opportunity 標準欄位、HubSpot Company/Contact/Deal 預設 properties、BANT（Budget/Authority/Need/Timing）與 MEDDIC/MEDDPICC（Metrics/Economic Buyer/Decision Criteria/Decision Process/Paper Process/Identify Pain/Champion/Competition）B2B 銷售資格框架。針對台灣 B2B 中小企業「開會逐字稿 → AI 自動抽取建案」的場景做裁剪，優先保留「AI 可從對話中合理抽取」的欄位，捨棄純後台管理型欄位（如 Currency、Division、Merge ID 等）。

---

## 群組一：公司資訊（Company / Account）
對應 Salesforce Account、HubSpot Company。

| 英文欄位名 | 中文標籤 | 型別 | Enum 選項 | AI 抽取 | 用途 |
|---|---|---|---|---|---|
| companyName | 公司名稱 | text | — | auto | 案件所屬的目標客戶公司 |
| industry | 產業別 | enum | 製造業／零售電商／餐飲／醫療／金融保險／科技軟體／教育／營建／物流運輸／專業服務／其他 | auto | 判斷方案適配度與案例參考 |
| companySize | 公司規模（人數） | enum | 1-10／11-50／51-200／201-500／500以上 | auto | 判斷決策複雜度與客單價定位 |
| companyWebsite | 公司網站 | text | — | manual | 補充公司背景資料，逐字稿通常不會念出網址 |
| headquartersLocation | 公司所在地 | text | — | auto | 判斷是否需現場拜訪、時區、在地服務資源 |
| currentToolsInUse | 現有使用工具／系統 | array | — | auto | 了解競品或既有系統，評估整合與替換成本 |
| annualRevenueRange | 年營收區間 | enum | 1000萬以下／1000萬-1億／1億-5億／5億以上／未知 | auto | 判斷預算量級與採購規模 |

## 群組二：窗口資訊（Contact）
對應 Salesforce Contact、HubSpot Contact。

| 英文欄位名 | 中文標籤 | 型別 | Enum 選項 | AI 抽取 | 用途 |
|---|---|---|---|---|---|
| contactName | 窗口姓名 | text | — | auto | 主要聯絡人身分識別 |
| contactTitle | 職稱 | text | — | auto | 判斷職級與決策影響力 |
| contactDepartment | 所屬部門 | enum | 業務銷售／行銷／IT資訊／財務／人資／營運／經營層／其他 | auto | 了解需求發起單位，判斷後續溝通對象 |
| contactPhone | 聯絡電話 | text | — | manual | 逐字稿通常不會完整念出，需人工補登 |
| contactEmail | 聯絡信箱 | text | — | manual | 逐字稿通常不會完整念出，需人工補登 |
| contactRole | 窗口角色 | enum | 經濟買家／決策者／使用者／技術把關者／內部推薦人（Champion）／影響者 | auto | 對應 MEDDIC 的 Economic Buyer / Champion 概念，判斷溝通策略 |
| additionalStakeholders | 其他關係人 | array | — | auto | 記錄會議中提到的其他利害關係人姓名與角色 |
| customerType | 客戶類型 | enum | 新客戶／既有客戶／流失客戶回訪／轉介紹 | auto | 沿用原欄位，判斷開發階段與溝通口吻 |

## 群組三：商機資訊（Opportunity / Deal）
對應 Salesforce Opportunity、HubSpot Deal，並融入 BANT／MEDDIC 資格要素。

| 英文欄位名 | 中文標籤 | 型別 | Enum 選項 | AI 抽取 | 用途 |
|---|---|---|---|---|---|
| dealName | 案件名稱 | text | — | auto | 案件識別標題，如「XX公司-AI客服導入案」 |
| salesStage | 銷售階段 | enum | 初步接觸／需求確認／方案提案／議價協商／決策審核／成交／失單 | auto | 沿用原欄位，對應 Opportunity Stage，驅動 pipeline 視圖 |
| needsSummary | 需求摘要 | text | — | auto | 沿用原欄位，AI 摘要客戶核心痛點與需求 |
| painPoints | 具體痛點清單 | array | — | auto | 對應 MEDDIC 的 Identify Pain，拆解需求摘要為可追蹤的痛點條列 |
| proposedSolution | 提案方案 | text | — | auto | 沿用原欄位，記錄業務提出的解法或產品組合 |
| budget | 預算 | text | — | auto | 沿用原欄位，客戶透露的預算數字或區間（文字保留原始表述） |
| budgetConfirmed | 預算是否已確認 | enum | 已確認／估算中／未提及 | auto | 對應 BANT 的 Budget，判斷資格成熟度 |
| decisionMaker | 決策者 | text | — | auto | 沿用原欄位，記錄誰有最終拍板權 |
| decisionProcess | 決策流程 | text | — | auto | 對應 MEDDIC 的 Decision Process，記錄採購/審批流程與關卡 |
| decisionCriteria | 決策評估標準 | array | — | auto | 對應 MEDDIC 的 Decision Criteria，記錄客戶比較方案的標準（價格/功能/服務等） |
| competitorMentioned | 提及競爭對手 | array | — | auto | 對應 MEDDPICC 的 Competition，記錄逐字稿提到的競品或替代方案 |
| successMetrics | 成功指標／期望效益 | text | — | auto | 對應 MEDDIC 的 Metrics，記錄客戶量化的期望成果（如節省X小時、降低X%成本） |
| dealAmount | 預估成交金額 | number | — | manual | 對應 Salesforce Amount，通常需業務事後估算填寫，非逐字稿直接可得 |
| probability | 成交機率 | number | — | manual | 對應 Salesforce Probability，需業務主觀判斷 |
| timeline | 導入/決策時程 | text | — | auto | 沿用原欄位，對應 BANT 的 Timing |
| expectedCloseDate | 預估成交日期 | date | — | auto | 對應 Close Date，若逐字稿提及明確時間點則抽取 |
| objections | 反對意見／疑慮 | text | — | auto | 沿用原欄位，記錄客戶顧慮 |
| nextStep | 下一步行動 | text | — | auto | 沿用原欄位，對應 Salesforce Next Step |
| followUpDate | 下次追蹤時間 | date | — | auto | 沿用原欄位 |
| leadSource | 案件來源 | enum | 電話開發／官網詢問／展會活動／轉介紹／廣告／既有客戶擴售／其他 | manual | 對應 Salesforce Lead Source，通常來自 CRM 建案時的既有資訊，非會議對話內容 |

## 群組四：AI 洞察（AI-derived Insights）
逐字稿分析衍生的輔助判斷欄位，非傳統 CRM 標準欄位，但對業務決策高價值。

| 英文欄位名 | 中文標籤 | 型別 | Enum 選項 | AI 抽取 | 用途 |
|---|---|---|---|---|---|
| dealHealthScore | 案件健康度 | enum | 高／中／低 | auto | AI 綜合會議語氣、痛點明確度、預算/決策資訊完整度給出的簡評 |
| urgencyLevel | 急迫程度 | enum | 高／中／低／未知 | auto | 判斷客戶是否有明確導入壓力或期限 |
| sentimentTone | 會議氛圍／客戶態度 | enum | 積極正向／中性觀望／保留疑慮／消極抗拒 | auto | 輔助業務判斷跟進口吻與力道 |
| riskFlags | 風險警示 | array | — | auto | 標記如「無決策者出席」「預算未確認」「競品已在使用」等風險訊號 |
| keyQuotes | 關鍵語句摘錄 | array | — | auto | 摘錄逐字稿中客戶原話的關鍵句子，供後續引用或說服素材 |
| meetingSummary | 會議摘要 | text | — | auto | AI 生成的整場會議濃縮摘要，供未參會同事快速掌握 |

---

## 相對於原 13 欄的新增說明

原本 13 欄（公司、窗口、職稱、客戶類型、需求、預算、Sales Stage、方案、Timeline、Objection、Decision Maker、下一步行動、Follow-up 時間）已涵蓋商機的核心骨架，但缺少三塊成熟 CRM 都有的結構：

1. **公司背景與規模化資訊缺失**：Salesforce/HubSpot 都把 Account/Company 與 Opportunity 分層，原 schema 把公司與商機混在一起、也沒有產業別、規模、營收區間——這些是判斷方案適配度與報價策略的關鍵，故新增 industry、companySize、annualRevenueRange 等欄位。
2. **窗口角色與多關係人缺失**：原本只有一位「決策者」文字欄，但 B2B 採購常是多人決策（MEDDIC 的 Economic Buyer / Champion 概念），故拆出 contactRole、additionalStakeholders，並保留 decisionMaker 但另加 decisionProcess、decisionCriteria 補完「誰、怎麼決、用什麼標準決」。
3. **資格判斷缺乏結構化證據**：原本的「需求」「預算」是自由文字，無法量化追蹤，故引入 BANT 的 budgetConfirmed、MEDDIC 的 successMetrics（Metrics）、painPoints（Identify Pain）、competitorMentioned（Competition），讓 AI 抽取的內容更貼近業界資格判斷框架，方便後續做 pipeline 品質分析。
4. **新增「AI 洞察」群組**是傳統 CRM 沒有但這個產品的差異化價值：dealHealthScore、riskFlags、sentimentTone、keyQuotes 都是「人工填 CRM 做不到、但 AI 聽逐字稿可以做到」的欄位，直接回應黑客松「AI 從會議自動建案」的核心賣點。
5. 少數欄位（dealAmount、probability、leadSource、contactPhone/Email）標記為 manual，因為逐字稿通常不會完整念出電話號碼、Email，且成交金額/機率多半需業務主觀估算，不宜強迫 AI 幻造數字。

---

## 參考來源
- [Opportunity Fields (Salesforce Help)](https://help.salesforce.com/s/articleView?id=sales.opp_fields.htm&language=en_US&type=5)
- [HubSpot's default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)
- [HubSpot's default contact properties](https://knowledge.hubspot.com/properties/hubspots-default-contact-properties)
- [HubSpot CRM default company properties](https://knowledge.hubspot.com/properties/hubspot-crm-default-company-properties)
- [Sales Qualification Frameworks: BANT, MEDDIC, SPICED (Demodesk)](https://demodesk.com/blog/sales-qualification-frameworks-how-to-choose)
- [MEDDPICC vs BANT (coffee.ai)](https://www.coffee.ai/articles/meddpicc-vs-bant-complex-b2b)
