/**
 * @sales-next/knowledge-base
 *
 * 獨立的企業知識庫模組。核心層零依賴、框架無關；
 * React UI 在 `@sales-next/knowledge-base/react`，Bedrock 在 `./providers/bedrock`。
 */

export type {
  Answer,
  Citation,
  DocType,
  FolderNode,
  KnowledgeDoc,
  KnowledgeDocInput,
  KnowledgeSource,
  SearchResult,
  SourceRef,
  TagCount,
  TaxonomyCoverage,
  TaxonomyKind,
  TaxonomyMode,
} from './core/types.js';

export type {
  DecisionMaker,
  MeetingJson,
  MeetingQuotes,
} from './core/meeting.js';
export { formatBudget, looksLikeMeetingJson } from './core/meeting.js';

export type { KnowledgeStore, Snapshot } from './core/store.js';
export {
  BaseStore,
  createDefaultStore,
  LocalStorageStore,
  MemoryStore,
  parseSnapshot,
} from './core/store.js';

/**
 * S3 儲存層 —— 「AWS 的 localStorage」。
 * 只能在伺服器端用，而且要另外安裝 `@aws-sdk/client-s3`。
 */
export type { S3ClientLike, S3StoreOptions } from './aws/s3-store.js';
export { S3Store } from './aws/s3-store.js';

export {
  activeKinds,
  buildFolderTree,
  buildTagCounts,
  countUnfiled,
  countUntagged,
  coverage,
  filterByFolder,
  filterByTags,
  folderName,
  isFiled,
  isTagged,
  isUnder,
  moveFolder,
  normalizePath,
  parentPath,
  pathSegments,
  ROOT,
  sortDocs,
  UNFILED,
} from './core/taxonomy.js';

export { tokenize } from './core/tokenize.js';
export { chunkDoc } from './core/chunk.js';
export type { Chunk } from './core/chunk.js';
export { buildIndex, searchChunks, searchDocs } from './core/search.js';
export type { SearchIndex } from './core/search.js';

export type {
  Classification,
  FolderClassification,
  TagClassification,
} from './core/classify.js';
export {
  applyClassification,
  classifyDocument,
  classifyIntoFolder,
  classifyIntoTags,
  DEFAULT_FOLDERS,
} from './core/classify.js';

export type { IngestResult, IngestTextOptions } from './core/ingest.js';
export {
  ingest,
  ingestMeetings,
  prepare,
  prepareMeetingDoc,
  prepareTextDoc,
} from './core/ingest.js';

export type { AskOptions, LlmProvider } from './core/qa.js';
export { ask, buildPrompt, extractiveAnswer } from './core/qa.js';

export {
  DEMO_MEETING,
  DEMO_MEETINGS,
  DEMO_QUESTIONS,
  isEmpty,
  seed,
} from './core/seed.js';
