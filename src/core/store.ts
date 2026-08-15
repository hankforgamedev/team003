import { makeId, now } from './id.js';
import { normalizePath } from './taxonomy.js';
import type { KnowledgeDoc, KnowledgeDocInput } from './types.js';

/**
 * 儲存層介面。
 *
 * **所有方法都是 async**，即使記憶體實作是同步的。
 * 這是刻意的：專案最後要部署到 AWS，之後把 localStorage 換成
 * DynamoDB / S3 / RDS 時，UI 和上層邏輯一行都不用改。
 */
export interface KnowledgeStore {
  listDocs(): Promise<KnowledgeDoc[]>;
  getDoc(id: string): Promise<KnowledgeDoc | null>;
  /** 新增或更新。沒給 id 就是新增。 */
  putDoc(input: KnowledgeDocInput): Promise<KnowledgeDoc>;
  removeDoc(id: string): Promise<void>;

  /**
   * 使用者手動建立、目前還沒有文件的空資料夾。
   * 有文件的資料夾是從 `doc.path` 推導的，不需要註冊。
   */
  listEmptyFolders(): Promise<string[]>;
  addEmptyFolder(path: string): Promise<void>;
  removeEmptyFolder(path: string): Promise<void>;

  /** 清空所有資料（demo 前重設用）。 */
  clear(): Promise<void>;
}

interface Snapshot {
  docs: KnowledgeDoc[];
  emptyFolders: string[];
}

const EMPTY: Snapshot = { docs: [], emptyFolders: [] };

/** 把輸入補齊成完整的 KnowledgeDoc。 */
function materialize(
  input: KnowledgeDocInput,
  existing: KnowledgeDoc | undefined,
): KnowledgeDoc {
  const timestamp = now();
  return {
    ...input,
    id: input.id ?? existing?.id ?? makeId('doc'),
    path: normalizePath(input.path),
    tags: dedupe(input.tags ?? []),
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * 共用的實作骨架。子類別只要提供讀寫整份快照的方法，
 * 其餘的 CRUD 語意（補 id、正規化路徑、去重標籤）都在這裡統一處理。
 */
abstract class BaseStore implements KnowledgeStore {
  protected abstract read(): Promise<Snapshot>;
  protected abstract write(snapshot: Snapshot): Promise<void>;

  async listDocs(): Promise<KnowledgeDoc[]> {
    const { docs } = await this.read();
    return docs;
  }

  async getDoc(id: string): Promise<KnowledgeDoc | null> {
    const { docs } = await this.read();
    return docs.find((d) => d.id === id) ?? null;
  }

  async putDoc(input: KnowledgeDocInput): Promise<KnowledgeDoc> {
    const snapshot = await this.read();
    const existing = input.id
      ? snapshot.docs.find((d) => d.id === input.id)
      : undefined;
    const doc = materialize(input, existing);

    const docs = existing
      ? snapshot.docs.map((d) => (d.id === doc.id ? doc : d))
      : [...snapshot.docs, doc];

    // 文件進駐之後，這個資料夾就不再是「空資料夾」了。
    // 未歸檔的文件（path 為 null）不會讓任何資料夾脫離空狀態。
    const emptyFolders =
      doc.path === null
        ? snapshot.emptyFolders
        : snapshot.emptyFolders.filter((f) => f !== doc.path);

    await this.write({ docs, emptyFolders });
    return doc;
  }

  async removeDoc(id: string): Promise<void> {
    const snapshot = await this.read();
    await this.write({
      ...snapshot,
      docs: snapshot.docs.filter((d) => d.id !== id),
    });
  }

  async listEmptyFolders(): Promise<string[]> {
    const { emptyFolders } = await this.read();
    return emptyFolders;
  }

  async addEmptyFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === null) return;
    const snapshot = await this.read();
    if (snapshot.emptyFolders.includes(normalized)) return;
    await this.write({
      ...snapshot,
      emptyFolders: [...snapshot.emptyFolders, normalized],
    });
  }

  async removeEmptyFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (normalized === null) return;
    const snapshot = await this.read();
    await this.write({
      ...snapshot,
      emptyFolders: snapshot.emptyFolders.filter((f) => f !== normalized),
    });
  }

  async clear(): Promise<void> {
    await this.write({ docs: [], emptyFolders: [] });
  }
}

/** 純記憶體實作。測試和 SSR 用。 */
export class MemoryStore extends BaseStore {
  private snapshot: Snapshot;

  constructor(initial: Partial<Snapshot> = {}) {
    super();
    this.snapshot = { ...EMPTY, ...initial };
  }

  protected async read(): Promise<Snapshot> {
    return this.snapshot;
  }

  protected async write(snapshot: Snapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

/**
 * localStorage 實作。沿用 Sales Next 現有的「每個瀏覽器是獨立工作區」模式，
 * demo 時不需要後端也能跑，評審點進去看到的是自己那份資料。
 */
export class LocalStorageStore extends BaseStore {
  constructor(private readonly key = 'sales-next.knowledge-base.v1') {
    super();
  }

  protected async read(): Promise<Snapshot> {
    if (typeof localStorage === 'undefined') return EMPTY;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      return {
        docs: Array.isArray(parsed.docs) ? parsed.docs : [],
        emptyFolders: Array.isArray(parsed.emptyFolders)
          ? parsed.emptyFolders
          : [],
      };
    } catch {
      // 資料壞掉時退回空的，不要讓整個知識庫開不起來。
      return EMPTY;
    }
  }

  protected async write(snapshot: Snapshot): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.key, JSON.stringify(snapshot));
  }
}

/** 依環境挑一個預設實作：瀏覽器用 localStorage，其他用記憶體。 */
export function createDefaultStore(): KnowledgeStore {
  return typeof localStorage === 'undefined'
    ? new MemoryStore()
    : new LocalStorageStore();
}
