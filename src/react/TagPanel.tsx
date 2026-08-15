import type { TagCount } from '../core/types.js';

interface TagPanelProps {
  tags: TagCount[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  /** 沒有進標籤系統的知識數。這是標籤系統自己的未分類桶子。 */
  untaggedCount: number;
  showUntagged: boolean;
  onShowUntagged: (value: boolean) => void;
}

/**
 * 標籤視角 —— 一套**獨立於資料夾**的分類系統。
 *
 * 這裡看到的成員跟資料夾視角不一樣：只歸檔沒標籤的知識在這裡看不到，
 * 只會出現在下面的「未標記」桶子裡。這是刻意的，不是漏掉。
 */
export function TagPanel({
  tags,
  selected,
  onToggle,
  onClear,
  untaggedCount,
  showUntagged,
  onShowUntagged,
}: TagPanelProps) {
  const hasSelection = selected.length > 0 || showUntagged;

  // 用出現次數決定字級，一眼看得出公司知識集中在哪些主題。
  const max = Math.max(...tags.map((t) => t.count), 1);

  return (
    <div className="kb-tag-panel">
      <div className="kb-tag-panel-head">
        <span className="kb-panel-title">標籤</span>
        {hasSelection && (
          <button type="button" className="kb-btn kb-btn-ghost kb-btn-sm" onClick={onClear}>
            清除
          </button>
        )}
      </div>

      {tags.length === 0 && (
        <p className="kb-empty-hint">
          還沒有任何標籤。匯入時系統會自動標，你也可以在文件頁自己加。
        </p>
      )}

      <div className="kb-tag-cloud">
        {tags.map(({ tag, count }) => {
          const isSelected = selected.includes(tag);
          const weight = count / max;
          return (
            <button
              key={tag}
              type="button"
              className={`kb-tag${isSelected ? ' is-selected' : ''}`}
              style={{ fontSize: `${0.78 + weight * 0.26}rem` }}
              onClick={() => onToggle(tag)}
              aria-pressed={isSelected}
            >
              {tag}
              <span className="kb-tag-count">{count}</span>
            </button>
          );
        })}
      </div>

      {untaggedCount > 0 && (
        <button
          type="button"
          className={`kb-unclassified${showUntagged ? ' is-selected' : ''}`}
          onClick={() => onShowUntagged(!showUntagged)}
          aria-pressed={showUntagged}
        >
          <span className="kb-unclassified-icon" aria-hidden="true">#</span>
          <span className="kb-folder-label">未標記</span>
          <span className="kb-folder-count">{untaggedCount}</span>
        </button>
      )}

      {selected.length > 1 && (
        <p className="kb-tag-hint">
          同時選了 {selected.length} 個標籤，只會顯示<strong>全部都符合</strong>的知識。
        </p>
      )}
    </div>
  );
}
