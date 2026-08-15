# Sales Next：CRM 與知識庫設計依據

## 1. 發現什麼

成熟 CRM 不會把所有資訊塞在同一張案件表，而是拆成四類互相關聯的物件：

- Company：產業、規模、地區、ICP tier、來源、負責人。
- Contact：姓名、職稱、Email、電話、偏好溝通管道、決策影響力。
- Deal：階段、金額、成交機率、加權金額、預測分類、預計結案日、下一步、優先級。
- Activity：會議、電話、Email、筆記、上次互動與下次活動。

HubSpot 的官方欄位也特別區分 deal probability、weighted amount、forecast category、next step、priority、next meeting；Salesforce 則把 Opportunity stage 對應到 probability 與 forecast category。兩者都把活動時間軸與關聯物件當成 record detail 的核心。

## 2. 這代表什麼

Sales Next 的優勢不是複製一套通用 CRM，而是利用逐字稿自動補齊最難維護的欄位：需求、痛點、異議、決策者、決策標準、競品、採購流程、下一步與風險。

列表需要讓業務在數秒內回答三件事：

1. 哪些案子最值得投入？
2. 哪些案子正在變危險？
3. 我現在應該做什麼？

## 3. 對產品有什麼影響

- 案件列表只顯示決策欄位，不把所有 metadata 平鋪成超寬表格。
- 案件詳情採三欄：公司／窗口、活動與 AI 下一步、資格判斷與商業脈絡。
- 每一筆案件都有 probability、weighted amount、forecast category、health 與 next activity。
- 知識庫採「可瀏覽的分類與節點＋搜尋＋AI 問答＋來源回查」，不再只有空白聊天框。
- AI 答案與 Next Best Action 必須保留來源或資料依據。

## 4. Pitch 呈現方式

1. 新增一份會議逐字稿。
2. AI 自動建立完整案件 record，而不只是摘要。
3. 在案件工作台顯示成交機率、加權營收、健康度與下一步。
4. 進入團隊知識庫，以客戶／需求／異議／打法瀏覽，再向 AI 提問並跳回原始會議。

## 參考資料

- [HubSpot default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)
- [HubSpot default company properties](https://knowledge.hubspot.com/properties/hubspot-crm-default-company-properties)
- [HubSpot default contact properties](https://knowledge.hubspot.com/properties/hubspots-default-contact-properties)
- [HubSpot record page layout](https://knowledge.hubspot.com/records/work-with-records)
- [HubSpot record associations](https://knowledge.hubspot.com/records/associate-records)
- [Salesforce opportunity fields](https://help.salesforce.com/s/articleView?id=sf.opp_fields.htm&language=en_US&type=5)
- [Salesforce opportunity stage and forecast mapping](https://help.salesforce.com/s/articleView?id=sf.faq_forecasts_category_mapping.htm&language=en_US&type=5)
