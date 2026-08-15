/**
 * 知識庫的資料模型。
 *
 * 設計原則：**一份資料、兩種視角**。
 * 每一筆知識同時帶 `path`（資料夾路徑）和 `tags`（標籤陣列）。
 * 資料夾樹和標籤牆是同一份資料的兩種渲染，不是兩套獨立的儲存，
 * 所以使用者可以自由切換視角，而且永遠不會出現「資料夾整理過、標籤沒整理」的漂移。
 *
 * 這個模組刻意**不認識 CRM**。知識庫存的是公司／產品知識，
 * CRM 存的是客戶案件檔案，兩者資料模型完全獨立。
 * 唯一的接點是 `sourceRef` 裡的字串 id（meetingId / caseId），
 * 只是純字串，不 import 任何 CRM 型別。
 */

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
   * 資料夾路徑，永遠以 `/` 開頭、不以 `/` 結尾，例如 `/公司知識/SOP`。
   * 根目錄是 `/`。
   */
  path: string;
  /** 標籤。同一筆知識可以有多個標籤。 */
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
   * 這筆知識是 AI 自動歸檔的，使用者還沒確認過。
   * UI 會標示「待確認」，讓使用者一鍵接受或改到別的資料夾。
   */
  autoFiled?: boolean;
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
  docPath: string;
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
