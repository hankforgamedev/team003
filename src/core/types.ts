/**
 * 知識庫的資料模型。
 *
 * 設計原則：**兩套完全獨立的分類系統**。
 *
 *   - 資料夾（`path`）：依「這是什麼文件」分類。像 Google Drive 一樣，
 *     一份文件只能在一個位置。`null` 代表這份知識**不在資料夾系統裡**。
 *   - 標籤（`tags`）：依「這份文件在講什麼」分類。可以掛多個。
 *     空陣列代表這份知識**不在標籤系統裡**。
 *
 * 兩者互不推導、互不同步：改資料夾不會動到標籤，反之亦然。
 * 一份知識可以只歸檔、只標記、兩邊都有、或兩邊都沒有。
 * 每個系統都有自己的「未分類」桶子和自己的涵蓋率。
 *
 * 這代表企業可以只用其中一套（`TaxonomyMode`），也代表兩邊可能不一致 ——
 * 那是刻意允許的，不是 bug。UI 會把每個系統的涵蓋率顯示出來，
 * 讓使用者知道「還有 12 筆沒有標籤」。
 *
 * 這個模組刻意**不認識 CRM**。知識庫存的是公司／產品知識，
 * CRM 存的是客戶案件檔案，兩者資料模型完全獨立。
 * 唯一的接點是 `sourceRef` 裡的字串 id（meetingId / caseId），
 * 只是純字串，不 import 任何 CRM 型別。
 */

/**
 * 這個知識庫啟用哪些分類系統。
 *
 * 企業的組織習慣不同：有些公司整套照資料夾走，有些公司只想用標籤。
 * 關掉的系統在 UI 上完全不出現，自動分類也不會去算它。
 */
export type TaxonomyMode = 'folder' | 'tag' | 'both';

/** 兩套分類系統的識別字。 */
export type TaxonomyKind = 'folder' | 'tag';

/** 知識的來源。 */
export type KnowledgeSource =
  /** 使用者上傳的檔案（.md / .txt / .pdf 等）。 */
  | 'upload'
  /** 使用者直接貼上的文字。 */
  | 'paste'
  /** 從會議 JSON 自動沉澱出來的。 */
  | 'meeting'
  /** 內建的示範資料。 */
  | 'seed';

/** 知識的類型，決定預設歸到哪個資料夾、帶哪些標籤。 */
export type DocType =
  /** 標準作業流程。 */
  | 'sop'
  /** 常見問答。 */
  | 'faq'
  /** 產品型錄、規格、報價原則。 */
  | 'catalog'
  /** 客戶知識（從會議沉澱）。 */
  | 'customer'
  | 'other';

export interface SourceRef {
  /** 會議 id，對應 昶龍 pipeline 輸出的 `meeting_id`。純字串，不耦合 CRM。 */
  meetingId?: string;
  /** CRM 案件 id。純字串，知識庫自己不會去解讀它。 */
  caseId?: string;
  /** 上傳時的原始檔名。 */
  fileName?: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  /** 內文，純文字或 Markdown。 */
  body: string;
  /**
   * 【分類系統一】資料夾路徑，以 `/` 開頭、不以 `/` 結尾，例如 `/公司知識/SOP`。
   *
   * `null` 代表這份知識**不在資料夾系統裡** —— 它不會出現在資料夾樹的任何一層，
   * 只會出現在「未歸檔」桶子裡。這跟放在根目錄 `/` 是不同的意思。
   */
  path: string | null;
  /**
   * 【分類系統二】標籤。與 `path` 完全獨立，改一邊不會動到另一邊。
   *
   * 空陣列代表這份知識**不在標籤系統裡**，只會出現在「未標記」桶子裡。
   */
  tags: string[];
  docType: DocType;
  source: KnowledgeSource;
  sourceRef?: SourceRef;
  /** 客戶名稱，只有 `docType: 'customer'` 會有。 */
  customer?: string;
  /** ISO 8601 字串。 */
  createdAt: string;
  updatedAt: string;
  /** 釘選到列表最上方。 */
  pinned?: boolean;
  /**
   * 資料夾位置是 AI 自動判斷的，使用者還沒確認過。
   * 與 `autoTagged` 分開記 —— 兩套系統各自確認，
   * 使用者可能同意 AI 的歸檔但想自己改標籤。
   */
  autoFiled?: boolean;
  /** 標籤是 AI 自動加的，使用者還沒確認過。 */
  autoTagged?: boolean;
}

/** 單一分類系統的涵蓋率。UI 用來顯示「還有幾筆沒分類」。 */
export interface TaxonomyCoverage {
  kind: TaxonomyKind;
  /** 已經在這個系統裡分類的知識數。 */
  classified: number;
  /** 還沒分類的知識數。 */
  unclassified: number;
  total: number;
}

/** 建立一筆新知識時可以提供的欄位。 */
export type KnowledgeDocInput = Omit<
  KnowledgeDoc,
  'id' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<KnowledgeDoc, 'id' | 'createdAt' | 'updatedAt'>>;

/** 資料夾樹的節點。由所有文件的 `path` 推導出來，不是獨立儲存的實體。 */
export interface FolderNode {
  /** 完整路徑，例如 `/公司知識/SOP`。 */
  path: string;
  /** 只有最後一段，例如 `SOP`。 */
  name: string;
  children: FolderNode[];
  /** 直接放在這層的文件數。 */
  docCount: number;
  /** 含所有子資料夾的文件總數。 */
  totalCount: number;
}

/** 標籤視角用的統計。 */
export interface TagCount {
  tag: string;
  count: number;
}

/** 檢索命中的一個片段，附帶回到原文的資訊。 */
export interface Citation {
  docId: string;
  docTitle: string;
  /** 來源文件的資料夾。`null` 代表這份知識未歸檔。 */
  docPath: string | null;
  /** 片段在 `doc.body` 中的起訖字元位置，UI 可以用來 highlight。 */
  start: number;
  end: number;
  /** 片段內容。 */
  text: string;
  /** 相關度分數，越高越相關。 */
  score: number;
  /** 若這筆知識來自某場會議，帶上會議 id 讓 UI 可以跳回去。 */
  meetingId?: string;
}

export interface SearchResult {
  doc: KnowledgeDoc;
  score: number;
  /** 最相關的片段，供列表顯示摘要。 */
  best: Citation;
}

/** 問答的回覆。 */
export interface Answer {
  question: string;
  /** 回答內容。離線模式下是抽取式的原文片段拼接。 */
  text: string;
  /** 出處。UI 點了可以跳回原文。 */
  citations: Citation[];
  /**
   * 這次回答是誰產生的，直接顯示在 UI 上。
   * 沿用 Sales Next 既有的「引擎透明標示」慣例。
   */
  engine: 'bedrock' | 'offline';
  /** 若降級成離線引擎，說明原因（沒設定、呼叫失敗…）。 */
  note?: string;
}
