import { prepareMeetingDoc, prepareTextDoc } from './ingest.js';
import type { MeetingJson } from './meeting.js';
import type { KnowledgeStore } from './store.js';
import { DEFAULT_FOLDERS } from './classify.js';
import type { KnowledgeDocInput } from './types.js';

/**
 * 內建示範資料。
 *
 * 挑選原則：每一筆都要能回答一個 demo 時會問的具體問題，
 * 而且答案要能在文件裡被指出來（評審點引文會跳到正確的段落）。
 * 不放空泛的填充內容 —— 評審點進去看到廢話，比沒有資料還糟。
 */

const SOP_DISCOUNT = `# 報價與折扣授權 SOP

## 適用範圍
所有對外報價，包含口頭報價。業務在會議中口頭給出的折扣同樣受本規範拘束。

## 折扣授權層級
- 一般業務：可自行決定 5% 以內的折扣。
- 業務主管：5%–15%，需在 CRM 留下折扣理由。
- 總經理：超過 15% 一律需要事前書面核准，不接受事後補簽。

## 年約的特殊規則
年約可在上述額度外再加 3%，但必須綁定「不可中途降級」條款。
若客戶要求年約折扣又不願接受綁約條款，視同一般月約，折扣回到原級距。

## 常見錯誤
最常見的爭議是業務在會議現場承諾「我回去幫你爭取」，客戶把它理解成已經答應。
標準話術是：「這個折扣需要主管核准，我最晚三個工作天內給你確定的答覆。」`;

const SOP_HANDOVER = `# 專案交接與上線流程 SOP

## 交接時程承諾
合約簽訂後 5 個工作天內完成 kick-off，一般專案 30 個工作天內上線。
客戶若在會議中提到「上次交接花了三個月」這類經驗，務必主動說明我們的時程承諾並寫進報價單。

## 交接空窗期的處理
簽約到 kick-off 之間指派專責窗口，這段期間客戶的所有問題由該窗口單一收斂。
這是我們相對於同業最明顯的差異，遇到有交接陰影的客戶要主動講。

## 上線後
上線後 14 天為保護期，期間的調整不另計費。`;

const FAQ_REFUND = `# 常見問題：合約與退費

## 客戶問「可以中途解約嗎？」
月約可在當期結束前 30 天通知終止，不收違約金。
年約中途解約需支付剩餘月份 30% 作為違約金，但若是我方未達成服務水準所致則全免。

## 客戶問「如果效果不好怎麼辦？」
前兩個月為效果觀察期，未達成雙方在合約附件約定的指標時，客戶可無條件轉為月約。
不要承諾「保證成效」——這是法務明確禁止的說法。

## 客戶問「付款方式有哪些？」
月約為每月月初請款，年約可選擇一次付清（再折 2%）或分四期。`;

const CATALOG = `# 服務方案與定價

## 月約
每月 8 萬起，含社群代操與基本成效報告。無綁約，適合想先試水溫的客戶。

## 年約
每月 6.5 萬起（等同月約的 8 折），需簽滿 12 個月。
含月約所有內容，另加：每季策略會議、專屬客戶成功窗口、內容拍攝 4 支／月。

## 內容拍攝加購
未含在月約內。單支 1.2 萬，年約客戶單支 8 千。
客戶若明確提到「需含內容拍攝」，直接建議年約 —— 拍攝需求下年約的總價通常比月約加購更低。

## 適用建議
品牌方客戶多半有長期內容需求，年約成交率明顯較高，優先推年約。`;

/**
 * 五筆會議測資，對應 pipeline（語音 → 逐字稿 → 抽取）的輸出格式。
 *
 * 刻意涵蓋不同情境，讓 demo 時「跑進來」之後看得到差異：
 *   m_001 資料完整、有異議、決策者未出席
 *   m_002 決策者有出席、預算是字串而非數字
 *   m_003 沒有異議、時程明確
 *   m_004 **抽取結果稀疏** —— 只有公司和需求，其餘欄位 AI 抽不到
 *   m_005 已成交、需求最單純
 *
 * m_004 是最重要的一筆：它會被歸到資料夾（公司名一定有），
 * 但產不出任何標籤 —— 這正好示範兩套分類系統是獨立的，
 * 而且這種「AI 只抽到一半」在真實 pipeline 裡很常見。
 */
const DEMO_MEETINGS: MeetingJson[] = [
  {
    meeting_id: 'm_001',
    meeting_date: '2026-08-14',
    company: '沐日食品',
    contact_name: '張怡君',
    contact_role: '行銷經理',
    customer_type: '品牌方',
    stage: '提案中',
    plan: '年約',
    need: '社群代操，需含內容拍攝',
    budget: 1200000,
    budget_confidence: '推估',
    timeline: null,
    objection: '擔心交接空窗期過長',
    decision_maker: { name: null, role: '老闆', attended: false },
    next_action: '三天內寄送含拍攝的年約版本報價',
    follow_up_raw: '下週三',
    follow_up_date: '2026-08-19',
    quotes: {
      budget: '我們今年這塊大概抓一百二左右',
      objection: '光是交接就搞了快三個月',
      plan: '年約我是可以接受啦',
      decision_maker: '還是要給我們老闆看過才能定',
    },
  },
  {
    meeting_id: 'm_002',
    meeting_date: '2026-08-12',
    company: '恆昌五金',
    contact_name: '林建良',
    contact_role: '業務副理',
    customer_type: '經銷商',
    stage: '議價中',
    plan: '月約',
    need: '通路端的產品education內容，先從三支短影音試水溫',
    // 預算抽成字串（客戶只說了模糊數字），格式化要能處理。
    budget: '每月五萬上下',
    budget_confidence: '客戶自述',
    timeline: '九月中要上檔',
    objection: '覺得月約單價比同業高',
    decision_maker: { name: '林建良', role: '業務副理', attended: true },
    next_action: '整理同業比較表，說明含拍攝的總持有成本',
    follow_up_raw: '這禮拜五前',
    follow_up_date: '2026-08-21',
    quotes: {
      budget: '一個月五萬上下我還可以自己決定',
      objection: '你們單價比我問的另外兩家都高欸',
      plan: '先月約做三支看看效果啦',
      decision_maker: '這個額度我簽就可以了',
    },
  },
  {
    meeting_id: 'm_003',
    meeting_date: '2026-08-11',
    company: '青禾生技',
    contact_name: '吳雅玲',
    contact_role: '品牌總監',
    customer_type: '品牌方',
    stage: '提案中',
    plan: '年約',
    need: '保健食品的衛教內容經營，需要能過法規審查的文案',
    budget: 1800000,
    budget_confidence: '明確',
    timeline: '十月一日前要有第一波內容',
    objection: null,
    decision_maker: { name: '吳雅玲', role: '品牌總監', attended: true },
    next_action: '兩週內提出含法規審查流程的年約提案',
    follow_up_raw: '月底前',
    follow_up_date: '2026-08-29',
    quotes: {
      budget: '今年這個項目編了一百八',
      plan: '我們希望是年約，比較好排內容節奏',
      decision_maker: '這個案子我這邊可以決定',
    },
  },
  {
    // 抽取結果稀疏：客戶只是初步詢問，AI 抽不到方案、預算、決策者。
    meeting_id: 'm_004',
    meeting_date: '2026-08-13',
    company: '立盛物流',
    contact_name: '陳柏諺',
    contact_role: null,
    customer_type: null,
    stage: '初次接觸',
    plan: null,
    need: '想了解 B2B 產業做內容行銷有沒有意義',
    budget: null,
    budget_confidence: null,
    timeline: null,
    objection: null,
    decision_maker: null,
    next_action: '寄送 B2B 產業的成功案例，兩週後再約',
    follow_up_raw: '兩週後',
    follow_up_date: '2026-08-27',
    quotes: {
      need: '我們這種做物流的，做這個真的有用嗎',
    },
  },
  {
    meeting_id: 'm_005',
    meeting_date: '2026-08-08',
    company: '樂沐餐飲',
    contact_name: '黃思穎',
    contact_role: '營運經理',
    customer_type: '連鎖品牌',
    stage: '已成交',
    plan: '季約',
    need: '新店開幕的社群預熱，三家分店同步',
    budget: 450000,
    budget_confidence: '明確',
    timeline: '九月一日開幕',
    objection: null,
    decision_maker: { name: '黃思穎', role: '營運經理', attended: true },
    next_action: '本週內完成合約用印，排入九月檔期',
    follow_up_raw: '本週內',
    follow_up_date: '2026-08-15',
    quotes: {
      budget: '三家店加起來四十五萬沒問題',
      plan: '就先做一季，開幕檔期最重要',
    },
  },
];

/** 第一筆保留具名匯出，方便單獨拿來測試或當範例。 */
const DEMO_MEETING = DEMO_MEETINGS[0] as MeetingJson;

const MEMO_PRICING = `# 2026 下半年定價調整備忘

自 9 月起年約基準價由每月 6.5 萬調整為 7 萬。
既有客戶續約時沿用原價至合約到期，不溯及既往。

調價期間如遇客戶議價，折扣授權額度不變，仍依原 SOP 辦理。`;

interface SeedDoc {
  title: string;
  body: string;
  /** `null` = 刻意不歸檔，用來示範兩套系統可以不同步。 */
  path: string | null;
  /** `[]` = 刻意不標籤。 */
  tags: string[];
  pinned?: boolean;
}

/**
 * 示範資料刻意涵蓋四種分類狀態，讓「兩套系統各自獨立」在畫面上看得出來：
 * 兩邊都有、只歸檔、只標籤、兩邊都沒有。
 */
const SEED_DOCS: SeedDoc[] = [
  // 兩套系統都分類了
  {
    title: '報價與折扣授權 SOP',
    body: SOP_DISCOUNT,
    path: '/公司知識/SOP',
    tags: ['報價', '折扣'],
    pinned: true,
  },
  {
    title: '常見問題：合約與退費',
    body: FAQ_REFUND,
    path: '/公司知識/FAQ',
    tags: ['合約', '退貨', '付款'],
  },
  {
    title: '服務方案與定價',
    body: CATALOG,
    path: '/公司知識/產品型錄',
    tags: ['報價', '合約'],
    pinned: true,
  },
  // 只歸檔、沒標籤 —— 在標籤視角看不到，會出現在「未標記」
  {
    title: '專案交接與上線流程 SOP',
    body: SOP_HANDOVER,
    path: '/公司知識/SOP',
    tags: [],
  },
  // 只標籤、沒歸檔 —— 在資料夾樹看不到，會出現在「未歸檔」
  {
    title: '2026 下半年定價調整備忘',
    body: MEMO_PRICING,
    path: null,
    tags: ['報價', '合約'],
  },
];

/** Demo 時的建議問題。每一題都能在示範資料裡找到明確答案。 */
export const DEMO_QUESTIONS = [
  '沐日食品的預算是多少？',
  '業務可以自己決定多少折扣？',
  '年約中途解約要付違約金嗎？',
  '客戶擔心交接空窗期，我要怎麼回？',
  '內容拍攝要另外加購嗎？',
] as const;

/**
 * 灌入示範資料。
 * `reset: true` 會先清空 —— demo 前按一下就回到乾淨狀態。
 */
export async function seed(
  store: KnowledgeStore,
  { reset = false } = {},
): Promise<void> {
  if (reset) await store.clear();

  for (const folder of DEFAULT_FOLDERS) {
    await store.addEmptyFolder(folder);
  }

  for (const item of SEED_DOCS) {
    const { doc } = prepareTextDoc(item.body, {
      title: item.title,
      path: item.path,
      tags: item.tags,
    });
    await store.putDoc({
      ...doc,
      source: 'seed',
      ...(item.pinned ? { pinned: true } : {}),
    } as KnowledgeDocInput);
  }

  for (const meeting of DEMO_MEETINGS) {
    const { doc } = prepareMeetingDoc(meeting);
    await store.putDoc({ ...doc, source: 'seed' } as KnowledgeDocInput);
  }
}

/** 知識庫是不是空的，UI 用來決定要不要顯示「載入示範資料」。 */
export async function isEmpty(store: KnowledgeStore): Promise<boolean> {
  const docs = await store.listDocs();
  return docs.length === 0;
}

export { DEMO_MEETING, DEMO_MEETINGS };
