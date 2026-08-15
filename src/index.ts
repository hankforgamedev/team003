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
} from './core/types.js';

export type {
  DecisionMaker,
  MeetingJson,
  MeetingQuotes,
} from './core/meeting.js';
export { formatBudget, looksLikeMeetingJson } from './core/meeting.js';

export type { KnowledgeStore } from './core/store.js';
export {
  createDefaultStore,
  LocalStorageStore,
  MemoryStore,
} from './core/store.js';

export {
  buildFolderTree,
  buildTagCounts,
  filterByFolder,
  filterByTags,
  folderName,
  isUnder,
  moveFolder,
  normalizePath,
  parentPath,
  pathSegments,
  ROOT,
  sortDocs,
} from './core/taxonomy.js';

export { tokenize } from './core/tokenize.js';
export { chunkDoc } from './core/chunk.js';
export type { Chunk } from './core/chunk.js';
export { buildIndex, searchChunks, searchDocs } from './core/search.js';
export type { SearchIndex } from './core/search.js';

export type { Classification } from './core/classify.js';
export {
  applyClassification,
  classifyDocument,
  DEFAULT_FOLDERS,
  INBOX,
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

export { DEMO_MEETING, DEMO_QUESTIONS, isEmpty, seed } from './core/seed.js';
