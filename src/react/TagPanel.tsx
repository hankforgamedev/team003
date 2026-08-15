import type { TagCount } from '../core/types.js';

interface TagPanelProps {
  tags: TagCount[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

/**
 * 標籤視角。
 *
 * 和資料夾樹讀的是同一份文件陣列 —— 這裡顯示的每個標籤，
 * 都來自某份文件的 `tags`，不是另一套獨立維護的分類。
 * 所以使用者在資料夾視角搬動文件，標籤這邊不會失真。
 */
export function TagPanel({ tags, selected, onToggle, onClear }: TagPanelProps) {
  if (tags.length === 0) {
    return (
      <div className="kb-tag-panel">
        <p className="kb-empty-hint">
          還沒有任何標籤。上傳文件時系統會自動標，你也可以在文件頁自己加。
        </p>
      </div>
    );
  }

  // 用出現次數決定字級，一眼看得出公司知識集中在哪些主題。
  const max = Math.max(...tags.map((t) => t.count), 1);

  return (
    <div className="kb-tag-panel">
      <div className="kb-tag-panel-head">
        <span className="kb-panel-title">標籤</span>
        {selected.length > 0 && (
          <button type="button" className="kb-btn kb-btn-ghost kb-btn-sm" onClick={onClear}>
            清除（{selected.length}）
          </button>
        )}
      </div>

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

      {selected.length > 1 && (
        <p className="kb-tag-hint">
          同時選了 {selected.length} 個標籤，只會顯示<strong>全部都符合</strong>的知識。
        </p>
      )}
    </div>
  );
}
