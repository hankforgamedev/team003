import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IngestResult, IngestTextOptions } from '../core/ingest.js';
import { ingest } from '../core/ingest.js';
import type { MeetingJson } from '../core/meeting.js';
import { ask } from '../core/qa.js';
import type { AskOptions } from '../core/qa.js';
import { searchDocs } from '../core/search.js';
import { seed } from '../core/seed.js';
import { createDefaultStore, type KnowledgeStore } from '../core/store.js';
import {
  activeKinds,
  buildFolderTree,
  buildTagCounts,
  countUnfiled,
  countUntagged,
  coverage,
  filterByFolder,
  filterByTags,
  ROOT,
  sortDocs,
} from '../core/taxonomy.js';
import type {
  Answer,
  KnowledgeDoc,
  TaxonomyCoverage,
  TaxonomyKind,
  TaxonomyMode,
} from '../core/types.js';

/**
 * 目前正在看哪一套分類系統。
 *
 * 注意這**不是**同一份資料的兩種渲染 —— 兩個視角的成員可以完全不同：
 * 只歸檔沒標籤的知識在標籤視角看不到，反之亦然。
 * 所以切換視角時看到的數量不一樣是正常的，UI 要把這件事講清楚。
 */
export type ViewMode = TaxonomyKind;

export interface UseKnowledgeBaseOptions {
  store?: KnowledgeStore;
  /** 知識庫是空的時候自動灌入示範資料。demo 很方便，正式環境要關掉。 */
  seedIfEmpty?: boolean;
  /** 問答的 LLM provider。不給就用內建的抽取式回答。 */
  askOptions?: AskOptions;
  /**
   * 啟用哪些分類系統。有些企業只想用資料夾，有些只想用標籤。
   * 關掉的系統在 UI 上完全不出現，自動分類也不會去算它。
   */
  mode?: TaxonomyMode;
}

export interface KnowledgeBaseApi {
  docs: KnowledgeDoc[];
  /** 套用完視角、篩選、搜尋之後真正要顯示的文件。 */
  visibleDocs: KnowledgeDoc[];
  loading: boolean;

  mode: TaxonomyMode;
  /** 這個模式下啟用的系統。UI 用來決定要不要顯示視角切換。 */
  kinds: TaxonomyKind[];
  view: ViewMode;
  setView: (view: ViewMode) => void;

  /** 兩套系統各自的涵蓋率。讓「不同步」是看得見的。 */
  folderCoverage: TaxonomyCoverage;
  tagCoverage: TaxonomyCoverage;

  // --- 分類系統一：資料夾 ---
  folderTree: ReturnType<typeof buildFolderTree>;
  /** 選到 `UNFILED` 代表正在看「未歸檔」桶子。 */
  selectedFolder: string;
  setSelectedFolder: (path: string) => void;
  unfiledCount: number;

  // --- 分類系統二：標籤 ---
  tagCounts: ReturnType<typeof buildTagCounts>;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  /** 正在看「未標記」桶子。 */
  showUntagged: boolean;
  setShowUntagged: (value: boolean) => void;
  untaggedCount: number;

  query: string;
  setQuery: (query: string) => void;

  addFolder: (path: string) => Promise<void>;
  saveDoc: (doc: KnowledgeDoc) => Promise<void>;
  removeDoc: (id: string) => Promise<void>;
  importContent: (
    input: string | MeetingJson,
    options?: IngestTextOptions,
  ) => Promise<IngestResult>;
  askQuestion: (question: string) => Promise<Answer>;
  loadDemoData: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * 知識庫的狀態管理。
 *
 * 所有 store 呼叫都是 async（為了之後換 DynamoDB），所以這裡
 * 統一用「動作 → 重新載入 → setState」的模式，不做樂觀更新 ——
 * 黑客松的規模下多一次讀取的成本可以忽略，但少掉一整類同步 bug。
 */
export function useKnowledgeBase(
  options: UseKnowledgeBaseOptions = {},
): KnowledgeBaseApi {
  const { seedIfEmpty = false, askOptions, mode = 'both' } = options;
  const kinds = useMemo(() => activeKinds(mode), [mode]);

  // store 只建一次。呼叫端每次 render 傳新的 store 進來是誤用，這裡以第一次為準。
  const [store] = useState<KnowledgeStore>(
    () => options.store ?? createDefaultStore(),
  );

  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 只啟用一套系統時，預設視角就是那一套。
  const [view, setView] = useState<ViewMode>(kinds[0] ?? 'folder');
  const [selectedFolder, setSelectedFolder] = useState<string>(ROOT);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showUntagged, setShowUntagged] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    const [nextDocs, nextFolders] = await Promise.all([
      store.listDocs(),
      store.listEmptyFolders(),
    ]);
    setDocs(nextDocs);
    setEmptyFolders(nextFolders);
  }, [store]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      if (seedIfEmpty) {
        const existing = await store.listDocs();
        if (existing.length === 0) await seed(store);
      }
      if (cancelled) return;
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [store, seedIfEmpty, refresh]);

  const folderTree = useMemo(
    () => buildFolderTree(docs, emptyFolders),
    [docs, emptyFolders],
  );
  const tagCounts = useMemo(() => buildTagCounts(docs), [docs]);

  const folderCoverage = useMemo(() => coverage(docs, 'folder'), [docs]);
  const tagCoverage = useMemo(() => coverage(docs, 'tag'), [docs]);
  const unfiledCount = useMemo(() => countUnfiled(docs), [docs]);
  const untaggedCount = useMemo(() => countUntagged(docs), [docs]);

  const visibleDocs = useMemo(() => {
    // 兩個視角篩出來的**成員本身就不一樣** —— 這不是同一份集合的兩種排列。
    // 只有搜尋和排序是共用的。
    const scoped =
      view === 'folder'
        ? filterByFolder(docs, selectedFolder)
        : filterByTags(docs, selectedTags, 'and', showUntagged);

    if (query.trim().length === 0) return sortDocs(scoped);
    return searchDocs(scoped, query).map((result) => result.doc);
  }, [docs, view, selectedFolder, selectedTags, showUntagged, query]);

  const toggleTag = useCallback((tag: string) => {
    // 選了具體標籤就不可能同時在看「未標記」，兩者互斥。
    setShowUntagged(false);
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }, []);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
    setShowUntagged(false);
  }, []);

  const selectUntagged = useCallback((value: boolean) => {
    setShowUntagged(value);
    if (value) setSelectedTags([]);
  }, []);

  const addFolder = useCallback(
    async (path: string) => {
      await store.addEmptyFolder(path);
      await refresh();
    },
    [store, refresh],
  );

  const saveDoc = useCallback(
    async (doc: KnowledgeDoc) => {
      await store.putDoc(doc);
      await refresh();
    },
    [store, refresh],
  );

  const removeDoc = useCallback(
    async (id: string) => {
      await store.removeDoc(id);
      await refresh();
    },
    [store, refresh],
  );

  const importContent = useCallback(
    async (input: string | MeetingJson, ingestOptions?: IngestTextOptions) => {
      const result = await ingest(store, input, { mode, ...ingestOptions });
      await refresh();
      return result;
    },
    [store, refresh, mode],
  );

  const askQuestion = useCallback(
    async (question: string) => ask(docs, question, askOptions),
    [docs, askOptions],
  );

  const loadDemoData = useCallback(async () => {
    await seed(store);
    await refresh();
  }, [store, refresh]);

  const reset = useCallback(async () => {
    await seed(store, { reset: true });
    setSelectedFolder(ROOT);
    setSelectedTags([]);
    setShowUntagged(false);
    setQuery('');
    await refresh();
  }, [store, refresh]);

  const selectFolder = useCallback((path: string) => {
    setSelectedFolder(path);
  }, []);

  return {
    docs,
    visibleDocs,
    loading,
    mode,
    kinds,
    view,
    setView,
    folderCoverage,
    tagCoverage,
    folderTree,
    selectedFolder,
    setSelectedFolder: selectFolder,
    unfiledCount,
    tagCounts,
    selectedTags,
    toggleTag,
    clearTags,
    showUntagged,
    setShowUntagged: selectUntagged,
    untaggedCount,
    query,
    setQuery,
    addFolder,
    saveDoc,
    removeDoc,
    importContent,
    askQuestion,
    loadDemoData,
    reset,
  };
}
