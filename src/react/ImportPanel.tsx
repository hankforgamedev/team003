import { useRef, useState } from 'react';
import type { IngestResult } from '../core/ingest.js';

interface ImportPanelProps {
  onImport: (text: string, fileName?: string) => Promise<IngestResult>;
  onDone: (docId: string) => void;
}

/** 能直接讀成文字的副檔名。PDF/Word 需要額外的解析器，見下方說明。 */
const TEXT_EXTENSIONS = ['.md', '.txt', '.markdown', '.json', '.csv'];

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
  );
}

/**
 * 匯入：上傳檔案或直接貼上。
 *
 * 貼上的內容如果是會議 JSON 會被自動認出來，轉成客戶知識；
 * 其他文字則走自動歸檔。使用者不用先選「我要匯入哪一種」。
 */
export function ImportPanel({ onImport, onDone }: ImportPanelProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (content: string, fileName?: string) => {
    if (!content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await onImport(content, fileName));
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!isTextFile(file)) {
      setError(
        `目前支援 ${TEXT_EXTENSIONS.join('、')} 和純文字檔。` +
          'PDF / Word 請先轉存成文字，或把內容貼到下面的框裡。',
      );
      return;
    }

    await run(await file.text(), file.name);
  };

  return (
    <section className="kb-import" aria-label="匯入知識">
      <div
        className={`kb-dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <p className="kb-dropzone-text">把檔案拖進來，或</p>
        <button
          type="button"
          className="kb-btn kb-btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          選擇檔案
        </button>
        <input
          ref={inputRef}
          type="file"
          className="kb-file-input"
          accept={TEXT_EXTENSIONS.join(',')}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      <div className="kb-import-paste">
        <textarea
          className="kb-textarea"
          rows={6}
          value={text}
          placeholder="或直接貼上內容。會議 JSON 會自動辨識成客戶知識。"
          onChange={(event) => setText(event.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="kb-btn"
          onClick={() => void run(text)}
          disabled={busy || !text.trim()}
        >
          {busy ? '整理中…' : '收進知識庫'}
        </button>
      </div>

      {error && <p className="kb-error">{error}</p>}

      {result && (
        <div className="kb-import-result">
          <div className="kb-import-result-head">
            <strong>{result.doc.title}</strong>
          </div>

          {/*
            兩套分類系統各自回報。分開顯示是刻意的 ——
            其中一套猜得出來、另一套猜不出來是很常見的結果，
            使用者要能一眼看出哪一套需要他補。
          */}
          <div className="kb-import-systems">
            <div className="kb-import-system">
              <div className="kb-import-system-head">
                <span><span aria-hidden="true">□</span> 資料夾</span>
                {result.doc.path ? (
                  <span className="kb-confidence">
                    把握度 {Math.round(result.classification.folder.confidence * 100)}%
                  </span>
                ) : (
                  <span className="kb-badge kb-badge-unclassified">未歸檔</span>
                )}
              </div>
              {result.doc.path && (
                <p className="kb-import-placed">
                  <code>{result.doc.path}</code>
                </p>
              )}
              <ul className="kb-reasons">
                {result.classification.folder.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="kb-import-system">
              <div className="kb-import-system-head">
                <span><span aria-hidden="true">#</span> 標籤</span>
                {result.doc.tags.length > 0 ? (
                  <span className="kb-confidence">
                    把握度 {Math.round(result.classification.tag.confidence * 100)}%
                  </span>
                ) : (
                  <span className="kb-badge kb-badge-unclassified">未標記</span>
                )}
              </div>
              {result.doc.tags.length > 0 && (
                <p className="kb-import-placed">
                  {result.doc.tags.map((t) => `「${t}」`).join('')}
                </p>
              )}
              <ul className="kb-reasons">
                {result.classification.tag.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>

          <button
            type="button"
            className="kb-btn kb-btn-sm"
            onClick={() => onDone(result.doc.id)}
          >
            去看看
          </button>
        </div>
      )}
    </section>
  );
}
