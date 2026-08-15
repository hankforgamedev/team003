import { useEffect, useMemo, useRef, useState } from 'react';
import { quickSwitch, splitByRanges } from '../core/quick-switch.js';
import type { KnowledgeDoc } from '../core/types.js';

/**
 * 命令面板 —— Obsidian 的 Cmd+P。
 *
 * 兩種模式，用 `>` 前綴切換（跟 VS Code 一樣的慣例）：
 *   - 直接打字 → 模糊比對**標題**，Enter 跳到那份知識
 *   - `>` 開頭 → 執行命令（切換視角、開問答、重設示範資料…）
 *
 * 為什麼值得做：知識庫一旦超過二三十份文件，用滑鼠在資料夾樹裡點來點去
 * 就變成負擔。鍵盤跳轉是「這個知識庫真的能用」跟「這是個 demo」的差別。
 */

export interface PaletteCommand {
  id: string;
  label: string;
  /** 顯示在右側的提示，例如目前狀態。 */
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  docs: KnowledgeDoc[];
  commands: PaletteCommand[];
  onSelectDoc: (id: string) => void;
  onClose: () => void;
}

/** 綁 Cmd/Ctrl+K 和 Cmd/Ctrl+P。回傳給宿主決定要不要開。 */
export function usePaletteHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'k' && key !== 'p') return;
      // Cmd+P 預設是列印，一定要擋掉。
      event.preventDefault();
      onOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}

export function CommandPalette({
  docs,
  commands,
  onSelectDoc,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCommandMode = query.startsWith('>');

  const docMatches = useMemo(
    () => (isCommandMode ? [] : quickSwitch(docs, query)),
    [docs, query, isCommandMode],
  );

  const commandMatches = useMemo(() => {
    if (!isCommandMode) return [];
    const needle = query.slice(1).trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(needle));
  }, [commands, query, isCommandMode]);

  const count = isCommandMode ? commandMatches.length : docMatches.length;

  // 換了查詢字串就把游標拉回第一筆，不然會停在不存在的位置。
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = (index: number) => {
    if (isCommandMode) {
      const command = commandMatches[index];
      if (!command) return;
      command.run();
    } else {
      const match = docMatches[index];
      if (!match) return;
      onSelectDoc(match.doc.id);
    }
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i + 1) % count));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (count === 0 ? 0 : (i - 1 + count) % count));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(active);
    }
  };

  return (
    <div
      className="kb-palette-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="kb-palette"
        role="dialog"
        aria-modal="true"
        aria-label="快速切換"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="kb-palette-input"
          value={query}
          placeholder="跳到知識…（輸入 > 執行命令）"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="搜尋"
        />

        <ul className="kb-palette-list" role="listbox">
          {isCommandMode
            ? commandMatches.map((command, index) => (
                <li key={command.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`kb-palette-item${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                  >
                    <span className="kb-palette-title">{command.label}</span>
                    {command.hint && (
                      <span className="kb-palette-path">{command.hint}</span>
                    )}
                  </button>
                </li>
              ))
            : docMatches.map((match, index) => (
                <li key={match.doc.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`kb-palette-item${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                  >
                    <span className="kb-palette-title">
                      {splitByRanges(match.doc.title, match.titleRanges).map(
                        (part, i) =>
                          part.hit ? (
                            <mark key={i} className="kb-palette-hit">
                              {part.text}
                            </mark>
                          ) : (
                            <span key={i}>{part.text}</span>
                          ),
                      )}
                    </span>
                    <span className="kb-palette-path">
                      {match.doc.path ?? '未歸檔'}
                      {match.matchedOn === 'path' && (
                        <span className="kb-palette-via">（路徑命中）</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
        </ul>

        {count === 0 && (
          <p className="kb-palette-empty">
            沒有符合的{isCommandMode ? '命令' : '知識'}。
            {!isCommandMode && '換個關鍵字，或到「問答」用整句話問。'}
          </p>
        )}

        <div className="kb-palette-footer">
          <kbd>↑</kbd>
          <kbd>↓</kbd> 選擇
          <kbd>Enter</kbd> 開啟
          <kbd>Esc</kbd> 關閉
        </div>
      </div>
    </div>
  );
}
