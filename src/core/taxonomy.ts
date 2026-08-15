import type { FolderNode, KnowledgeDoc, TagCount } from './types.js';

/**
 * 分類邏輯：從同一份文件陣列，同時推導出「資料夾樹」和「標籤統計」。
 *
 * 資料夾不是獨立的實體 — 它是所有 `doc.path` 的集合所隱含的樹。
 * 這樣就不會有「資料夾存在但沒有文件指向它」或反過來的不一致。
 * 唯一的例外是使用者手動建立、還沒放東西的空資料夾，
 * 由 store 額外記錄，在建樹時合併進來。
 */

export const ROOT = '/';

/** 把任意輸入正規化成標準路徑：以 `/` 開頭、不以 `/` 結尾、沒有空段。 */
export function normalizePath(input: string | undefined | null): string {
  if (!input) return ROOT;
  const segments = input
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.length === 0 ? ROOT : `/${segments.join('/')}`;
}

/** 拆成路徑片段。根目錄回傳空陣列。 */
export function pathSegments(path: string): string[] {
  const normalized = normalizePath(path);
  return normalized === ROOT ? [] : normalized.slice(1).split('/');
}

/** 取得父資料夾路徑。根目錄的父層還是根目錄。 */
export function parentPath(path: string): string {
  const segments = pathSegments(path);
  if (segments.length <= 1) return ROOT;
  return `/${segments.slice(0, -1).join('/')}`;
}

/** 資料夾顯示名稱（最後一段）。 */
export function folderName(path: string): string {
  const segments = pathSegments(path);
  return segments.at(-1) ?? '知識庫';
}

/** `child` 是否在 `ancestor` 之下（含自己）。 */
export function isUnder(child: string, ancestor: string): boolean {
  const a = normalizePath(ancestor);
  const c = normalizePath(child);
  if (a === ROOT) return true;
  return c === a || c.startsWith(`${a}/`);
}

/**
 * 從文件建出完整的資料夾樹。
 * `extraFolders` 是使用者建立但還沒放東西的空資料夾。
 */
export function buildFolderTree(
  docs: KnowledgeDoc[],
  extraFolders: string[] = [],
): FolderNode {
  const directCount = new Map<string, number>();
  const allPaths = new Set<string>([ROOT]);

  const register = (path: string) => {
    // 把每一層祖先都登記進來，中間層才不會斷掉。
    const segments = pathSegments(path);
    for (let i = 1; i <= segments.length; i++) {
      allPaths.add(`/${segments.slice(0, i).join('/')}`);
    }
  };

  for (const doc of docs) {
    const path = normalizePath(doc.path);
    register(path);
    directCount.set(path, (directCount.get(path) ?? 0) + 1);
  }
  for (const folder of extraFolders) {
    register(normalizePath(folder));
  }

  const childrenOf = new Map<string, string[]>();
  for (const path of allPaths) {
    if (path === ROOT) continue;
    const parent = parentPath(path);
    const list = childrenOf.get(parent) ?? [];
    list.push(path);
    childrenOf.set(parent, list);
  }

  const build = (path: string): FolderNode => {
    const childPaths = (childrenOf.get(path) ?? []).sort((a, b) =>
      folderName(a).localeCompare(folderName(b), 'zh-Hant'),
    );
    const children = childPaths.map(build);
    const docCount = directCount.get(path) ?? 0;
    const totalCount =
      docCount + children.reduce((sum, c) => sum + c.totalCount, 0);
    return { path, name: folderName(path), children, docCount, totalCount };
  };

  return build(ROOT);
}

/** 標籤統計，依出現次數由多到少排序。 */
export function buildTagCounts(docs: KnowledgeDoc[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const tag of doc.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'));
}

/**
 * 依資料夾篩選。
 * `includeDescendants` 預設 true —— 點「公司知識」時，底下 SOP、FAQ 的文件也會出現，
 * 這是 Google Drive 使用者不習慣、但知識庫比較合理的行為，所以做成可切換。
 */
export function filterByFolder(
  docs: KnowledgeDoc[],
  path: string,
  includeDescendants = true,
): KnowledgeDoc[] {
  const target = normalizePath(path);
  if (target === ROOT && includeDescendants) return docs;
  return docs.filter((doc) => {
    const docPath = normalizePath(doc.path);
    return includeDescendants ? isUnder(docPath, target) : docPath === target;
  });
}

/** 依標籤篩選。`mode: 'and'` 要全中，`'or'` 中一個就算。 */
export function filterByTags(
  docs: KnowledgeDoc[],
  tags: string[],
  mode: 'and' | 'or' = 'and',
): KnowledgeDoc[] {
  if (tags.length === 0) return docs;
  return docs.filter((doc) => {
    const owned = new Set(doc.tags);
    return mode === 'and'
      ? tags.every((t) => owned.has(t))
      : tags.some((t) => owned.has(t));
  });
}

/** 把一個資料夾（含子資料夾）裡的所有文件搬到新位置。回傳更新後的文件。 */
export function moveFolder(
  docs: KnowledgeDoc[],
  from: string,
  to: string,
): KnowledgeDoc[] {
  const source = normalizePath(from);
  const target = normalizePath(to);
  if (source === ROOT || source === target) return [];
  if (isUnder(target, source)) {
    throw new Error('不能把資料夾搬進自己的子資料夾');
  }

  const moved: KnowledgeDoc[] = [];
  for (const doc of docs) {
    const docPath = normalizePath(doc.path);
    if (!isUnder(docPath, source)) continue;
    const suffix = docPath.slice(source.length); // '' 或 '/子資料夾'
    moved.push({ ...doc, path: normalizePath(`${target}${suffix}`) });
  }
  return moved;
}

/** 排序：釘選的優先，其次照更新時間由新到舊。 */
export function sortDocs(docs: KnowledgeDoc[]): KnowledgeDoc[] {
  return [...docs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
