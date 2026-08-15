import { useCallback, useEffect, useState } from 'react';
import type { AskOptions } from '../core/qa.js';
import type { KnowledgeStore } from '../core/store.js';
import type { Citation, TaxonomyMode } from '../core/types.js';
import { AskPanel } from './AskPanel.js';
import { DocDetail } from './DocDetail.js';
import { DocList } from './DocList.js';
import { FolderTree } from './FolderTree.js';
import { ImportPanel } from './ImportPanel.js';
import { TagPanel } from './TagPanel.js';
import { useKnowledgeBase } from './useKnowledgeBase.js';

export interface KnowledgeBaseProps {
  store?: KnowledgeStore;
  /** 知識庫是空的時就自動灌示範資料。 */
  seedIfEmpty?: boolean;
  askOptions?: AskOptions;
  /**
   * 啟用哪些分類系統。`'folder'` / `'tag'` 只啟用一套，`'both'`（預設）兩套都開。
   * 只啟用一套時，視角切換不會出現。
   */
  mode?: TaxonomyMode;
  /** 點「回到這場會議」時呼叫，讓宿主 app 導頁。 */
  onOpenMeeting?: (meetingId: string) => void;
}

type Tab = 'browse' | 'ask' | 'import';

/**
 * 知識庫主畫面。
 *
 * 版面是三欄：左邊分類、中間列表、右邊內容。
 *
 * 左上角切換的是**兩套獨立的分類系統**，不是同一份資料的兩種排法 ——
 * 切過去會看到不同的成員、不同的數量、各自的未分類桶子。
 * 所以切換鈕旁邊一定要顯示每套系統的涵蓋率，
 * 使用者才不會以為「切過去東西不見了」。
 */
export function KnowledgeBase({
  store,
  seedIfEmpty = false,
  askOptions,
  mode = 'both',
  onOpenMeeting,
}: KnowledgeBaseProps) {
  const kb = useKnowledgeBase({
    ...(store ? { store } : {}),
    seedIfEmpty,
    mode,
    ...(askOptions ? { askOptions } : {}),
  });

  const [tab, setTab] = useState<Tab>('browse');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const selectedDoc =
    kb.docs.find((doc) => doc.id === selectedId) ?? null;

  // 選中的文件被刪掉、或被篩選條件排除時，把選取狀態清掉，
  // 不然右欄會一直顯示一份使用者已經看不到的文件。
  useEffect(() => {
    if (selectedId && !kb.docs.some((doc) => doc.id === selectedId)) {
      setSelectedId(null);
      setHighlight(null);
    }
  }, [kb.docs, selectedId]);

  const selectDoc = useCallback((id: string) => {
    setSelectedId(id);
    setHighlight(null);
  }, []);

  /** 從問答的引文跳回原文：切到瀏覽頁、選中文件、highlight 該段。 */
  const openCitation = useCallback((citation: Citation) => {
    setTab('browse');
    setSelectedId(citation.docId);
    setHighlight({ start: citation.start, end: citation.end });
  }, []);

  if (kb.loading) {
    return <div className="kb-root kb-loading">載入知識庫…</div>;
  }

  return (
    <div className="kb-root">
      <header className="kb-header">
        <h1 className="kb-heading">知識庫</h1>

        <nav className="kb-tabs" aria-label="知識庫功能">
          {(
            [
              ['browse', '瀏覽'],
              ['ask', '問答'],
              ['import', '匯入'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`kb-tab${tab === value ? ' is-active' : ''}`}
              onClick={() => setTab(value)}
              aria-current={tab === value ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="kb-header-actions">
          <span className="kb-doc-total">{kb.docs.length} 筆知識</span>
          <button
            type="button"
            className="kb-btn kb-btn-ghost kb-btn-sm"
            onClick={() => void kb.reset()}
          >
            重設示範資料
          </button>
        </div>
      </header>

      {tab === 'ask' && (
        <AskPanel onAsk={kb.askQuestion} onOpenCitation={openCitation} />
      )}

      {tab === 'import' && (
        <ImportPanel
          onImport={(text, fileName) =>
            kb.importContent(
              text,
              fileName ? { fileName, source: 'upload' } : { source: 'paste' },
            )
          }
          onDone={(docId) => {
            setTab('browse');
            selectDoc(docId);
          }}
        />
      )}

      {tab === 'browse' && (
        <div className="kb-body">
          <aside className="kb-sidebar">
            {/* 兩套系統都啟用時才需要切換鈕。 */}
            {kb.kinds.length > 1 && (
              <div className="kb-view-switch" role="group" aria-label="分類系統">
                <button
                  type="button"
                  className={`kb-view-btn${kb.view === 'folder' ? ' is-active' : ''}`}
                  onClick={() => kb.setView('folder')}
                  aria-pressed={kb.view === 'folder'}
                >
                  📁 資料夾
                  <span className="kb-view-coverage">
                    {kb.folderCoverage.classified}/{kb.folderCoverage.total}
                  </span>
                </button>
                <button
                  type="button"
                  className={`kb-view-btn${kb.view === 'tag' ? ' is-active' : ''}`}
                  onClick={() => kb.setView('tag')}
                  aria-pressed={kb.view === 'tag'}
                >
                  🏷️ 標籤
                  <span className="kb-view-coverage">
                    {kb.tagCoverage.classified}/{kb.tagCoverage.total}
                  </span>
                </button>
              </div>
            )}

            {/*
              兩套系統獨立最直接的後果：涵蓋率不一樣。
              把它講明白，使用者切過去才不會以為知識不見了。
            */}
            {kb.kinds.length > 1 &&
              kb.folderCoverage.classified !== kb.tagCoverage.classified && (
                <p className="kb-taxonomy-note">
                  兩套分類各自獨立，成員不一定相同。
                  {kb.view === 'folder' && kb.folderCoverage.unclassified > 0 && (
                    <> 有 {kb.folderCoverage.unclassified} 筆還沒歸檔。</>
                  )}
                  {kb.view === 'tag' && kb.tagCoverage.unclassified > 0 && (
                    <> 有 {kb.tagCoverage.unclassified} 筆還沒標記。</>
                  )}
                </p>
              )}

            {kb.view === 'folder' ? (
              <FolderTree
                tree={kb.folderTree}
                selected={kb.selectedFolder}
                onSelect={kb.setSelectedFolder}
                onAddFolder={(path) => void kb.addFolder(path)}
                unfiledCount={kb.unfiledCount}
              />
            ) : (
              <TagPanel
                tags={kb.tagCounts}
                selected={kb.selectedTags}
                onToggle={kb.toggleTag}
                onClear={kb.clearTags}
                untaggedCount={kb.untaggedCount}
                showUntagged={kb.showUntagged}
                onShowUntagged={kb.setShowUntagged}
              />
            )}
          </aside>

          <section className="kb-main">
            <input
              className="kb-input kb-search"
              value={kb.query}
              placeholder="搜尋這個範圍裡的知識…"
              onChange={(event) => kb.setQuery(event.target.value)}
            />
            <DocList
              docs={kb.visibleDocs}
              selectedId={selectedId}
              onSelect={selectDoc}
              query={kb.query}
            />
          </section>

          <section className="kb-detail">
            {selectedDoc ? (
              <DocDetail
                doc={selectedDoc}
                onSave={(doc) => void kb.saveDoc(doc)}
                onRemove={(id) => void kb.removeDoc(id)}
                highlight={highlight}
                {...(onOpenMeeting ? { onOpenMeeting } : {})}
              />
            ) : (
              <div className="kb-detail-empty">
                <p className="kb-empty-hint">從左邊選一筆知識來看內容。</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
