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
  buildFolderTree,
  buildTagCounts,
  filterByFolder,
  filterByTags,
  ROOT,
  sortDocs,
} from '../core/taxonomy.js';
import type { Answer, KnowledgeDoc } from '../core/types.js';

/** 資料夾視角 vs 標籤視角。同一份資料的兩種渲染。 */
export type ViewMode = 'folder' | 'tag';

export interface UseKnowledgeBaseOptions {
  store?: KnowledgeStore;
  /** 知識庫是空的時候自動灌入示範資料。demo 很方便，正式環境要關掉。 */
  seedIfEmpty?: boolean;
  /** 問答的 LLM provider。不給就用內建的抽取式回答。 */
  askOptions?: AskOptions;
}

export interface KnowledgeBaseApi {
  docs: KnowledgeDoc[];
  /** 套用完視角、篩選、搜尋之後真正要顯示的文件。 */
  visibleDocs: KnowledgeDoc[];
  loading: boolean;

  view: ViewMode;
  setView: (view: ViewMode) => void;

  folderTree: ReturnType<typeof buildFolderTree>;
  selectedFolder: string;
  setSelectedFolder: (path: string) => void;

  tagCounts: ReturnType<typeof buildTagCounts>;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;

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
  const { seedIfEmpty = false, askOptions } = options;

  // store 只建一次。呼叫端每次 render 傳新的 store 進來是誤用，這裡以第一次為準。
  const [store] = useState<KnowledgeStore>(
    () => options.store ?? createDefaultStore(),
  );

  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<ViewMode>('folder');
  const [selectedFolder, setSelectedFolder] = useState<string>(ROOT);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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

  const visibleDocs = useMemo(() => {
    // 兩種視角只差在「用什麼篩」，篩完之後的搜尋和排序完全共用。
    const scoped =
      view === 'folder'
        ? filterByFolder(docs, selectedFolder)
        : filterByTags(docs, selectedTags);

    if (query.trim().length === 0) return sortDocs(scoped);
    return searchDocs(scoped, query).map((result) => result.doc);
  }, [docs, view, selectedFolder, selectedTags, query]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

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
      const result = await ingest(store, input, ingestOptions);
      await refresh();
      return result;
    },
    [store, refresh],
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
    setQuery('');
    await refresh();
  }, [store, refresh]);

  return {
    docs,
    visibleDocs,
    loading,
    view,
    setView,
    folderTree,
    selectedFolder,
    setSelectedFolder,
    tagCounts,
    selectedTags,
    toggleTag,
    clearTags,
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
