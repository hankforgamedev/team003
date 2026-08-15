import { useState } from 'react';
import { ROOT } from '../core/taxonomy.js';
import type { FolderNode } from '../core/types.js';

interface FolderTreeProps {
  tree: FolderNode;
  selected: string;
  onSelect: (path: string) => void;
  onAddFolder?: (path: string) => void;
}

interface RowProps {
  node: FolderNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}

function FolderRow({ node, depth, selected, onSelect }: RowProps) {
  // 預設展開前兩層。再深的層級使用者通常是刻意收納的，不要幫他打開。
  const [open, setOpen] = useState(depth < 2);
  const isSelected = node.path === selected;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={`kb-folder-row${isSelected ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          type="button"
          className="kb-folder-toggle"
          onClick={() => setOpen((v) => !v)}
          // 沒有子資料夾時這個按鈕不該進 tab 順序，但保留位置讓縮排對齊。
          aria-hidden={!hasChildren}
          tabIndex={hasChildren ? 0 : -1}
          aria-label={open ? '收合' : '展開'}
          disabled={!hasChildren}
        >
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </button>

        <button
          type="button"
          className="kb-folder-name"
          onClick={() => onSelect(node.path)}
          aria-current={isSelected ? 'true' : undefined}
        >
          <span className="kb-folder-icon" aria-hidden="true">
            {node.path === ROOT ? '🗄️' : open && hasChildren ? '📂' : '📁'}
          </span>
          <span className="kb-folder-label">
            {node.path === ROOT ? '全部知識' : node.name}
          </span>
          <span className="kb-folder-count">{node.totalCount}</span>
        </button>
      </div>

      {hasChildren && open && (
        <ul className="kb-folder-children">
          {node.children.map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 資料夾樹。刻意做成 Google Drive 的樣子 —— 大部分企業都用過 Drive，
 * 這裡不需要教學就會用。
 */
export function FolderTree({
  tree,
  selected,
  onSelect,
  onAddFolder,
}: FolderTreeProps) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = () => {
    const name = draft.trim();
    if (!name || !onAddFolder) return;
    // 新資料夾建在目前選取的位置底下，符合檔案總管的直覺。
    const parent = selected === ROOT ? '' : selected;
    onAddFolder(`${parent}/${name}`);
    setDraft('');
    setAdding(false);
  };

  return (
    <nav className="kb-folder-tree" aria-label="資料夾">
      <ul className="kb-folder-root">
        <FolderRow node={tree} depth={0} selected={selected} onSelect={onSelect} />
      </ul>

      {onAddFolder &&
        (adding ? (
          <form
            className="kb-folder-add"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              className="kb-input"
              autoFocus
              value={draft}
              placeholder="資料夾名稱"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAdding(false);
              }}
            />
            <button type="submit" className="kb-btn kb-btn-sm">
              建立
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="kb-btn kb-btn-ghost kb-btn-sm kb-folder-add-btn"
            onClick={() => setAdding(true)}
          >
            ＋ 新資料夾
          </button>
        ))}
    </nav>
  );
}
