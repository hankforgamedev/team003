import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeDoc } from '../core/types.js';

interface DocDetailProps {
  doc: KnowledgeDoc;
  onSave: (doc: KnowledgeDoc) => void;
  onRemove: (id: string) => void;
  /** 從問答點引文跳過來時，要 highlight 的字元區間。 */
  highlight?: { start: number; end: number } | null;
  /** 點「回到這場會議」時觸發。給宿主 app 導頁到會議紀錄用。 */
  onOpenMeeting?: (meetingId: string) => void;
}

/**
 * 文件詳情。
 *
 * 資料夾和標籤在這裡是**兩個分開的區塊**，各自有自己的「未分類」狀態
 * 和自己的 AI 待確認提示。改一邊不會動到另一邊 ——
 * 版面上分開，使用者才會理解它們是兩套獨立的分類，而不是同一件事的兩種寫法。
 */
export function DocDetail({
  doc,
  onSave,
  onRemove,
  highlight,
  onOpenMeeting,
}: DocDetailProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  // 空字串代表未歸檔。輸入框沒辦法表達 null，在 save 時轉回去。
  const [path, setPath] = useState(doc.path ?? '');
  const [tagDraft, setTagDraft] = useState('');

  // 切換到另一份文件時把編輯狀態重置，不然會把 A 的內容存到 B 身上。
  useEffect(() => {
    setEditing(false);
    setTitle(doc.title);
    setBody(doc.body);
    setPath(doc.path ?? '');
    setTagDraft('');
  }, [doc.id, doc.title, doc.body, doc.path]);

  const segments = useMemo(
    () => splitForHighlight(doc.body, highlight),
    [doc.body, highlight],
  );

  const save = () => {
    const trimmed = path.trim();
    onSave({
      ...doc,
      title,
      body,
      // 清空資料夾欄位 = 把這份知識移出資料夾系統，不是搬到根目錄。
      path: trimmed === '' ? null : trimmed,
      autoFiled: false,
    });
    setEditing(false);
  };

  // 標籤是另一套系統，改它不碰 path，也不碰 autoFiled。
  const addTag = () => {
    const tag = tagDraft.trim();
    if (!tag || doc.tags.includes(tag)) {
      setTagDraft('');
      return;
    }
    onSave({ ...doc, tags: [...doc.tags, tag], autoTagged: false });
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    onSave({
      ...doc,
      tags: doc.tags.filter((t) => t !== tag),
      autoTagged: false,
    });
  };

  return (
    <article className="kb-doc-detail">
      <header className="kb-doc-detail-head">
        {editing ? (
          <input
            className="kb-input kb-input-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        ) : (
          <h2 className="kb-doc-detail-title">{doc.title}</h2>
        )}

        <div className="kb-doc-actions">
          <button
            type="button"
            className="kb-btn kb-btn-ghost kb-btn-sm"
            onClick={() => onSave({ ...doc, pinned: !doc.pinned })}
          >
            {doc.pinned ? '取消釘選' : '釘選'}
          </button>
          {editing ? (
            <>
              <button type="button" className="kb-btn kb-btn-sm" onClick={save}>
                儲存
              </button>
              <button
                type="button"
                className="kb-btn kb-btn-ghost kb-btn-sm"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="kb-btn kb-btn-ghost kb-btn-sm"
              onClick={() => setEditing(true)}
            >
              編輯
            </button>
          )}
          <button
            type="button"
            className="kb-btn kb-btn-ghost kb-btn-sm kb-btn-danger"
            onClick={() => onRemove(doc.id)}
          >
            刪除
          </button>
        </div>
      </header>

      <div className="kb-doc-meta">
        {/* ── 分類系統一：資料夾 ────────────────────────────── */}
        <section className="kb-taxonomy-block">
          <div className="kb-taxonomy-head">
            <span className="kb-taxonomy-title"><span aria-hidden="true">□</span> 資料夾</span>
            {doc.path === null && (
              <span className="kb-badge kb-badge-unclassified">未歸檔</span>
            )}
          </div>

          {editing ? (
            <input
              className="kb-input"
              value={path}
              placeholder="留空 = 不放進資料夾系統"
              onChange={(event) => setPath(event.target.value)}
            />
          ) : (
            <div className="kb-taxonomy-value">
              {doc.path ?? (
                <span className="kb-muted">
                  這份知識不在資料夾系統裡，只會出現在「未歸檔」。
                </span>
              )}
            </div>
          )}

          {doc.autoFiled && (
            <div className="kb-notice kb-notice-inline">
              資料夾位置是 AI 判斷的，還沒確認過。
              <button
                type="button"
                className="kb-btn kb-btn-sm"
                onClick={() => onSave({ ...doc, autoFiled: false })}
              >
                位置正確
              </button>
            </div>
          )}
        </section>

        {/* ── 分類系統二：標籤（與上面完全獨立） ──────────────── */}
        <section className="kb-taxonomy-block">
          <div className="kb-taxonomy-head">
            <span className="kb-taxonomy-title"><span aria-hidden="true">#</span> 標籤</span>
            {doc.tags.length === 0 && (
              <span className="kb-badge kb-badge-unclassified">未標記</span>
            )}
          </div>

          <div className="kb-tag-editor">
            {doc.tags.map((tag) => (
              <span key={tag} className="kb-tag kb-tag-static">
                {tag}
                <button
                  type="button"
                  className="kb-tag-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`移除標籤 ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="kb-input kb-input-tag"
              value={tagDraft}
              placeholder="加標籤…"
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>

          {doc.autoTagged && (
            <div className="kb-notice kb-notice-inline">
              標籤是 AI 加的，還沒確認過。
              <button
                type="button"
                className="kb-btn kb-btn-sm"
                onClick={() => onSave({ ...doc, autoTagged: false })}
              >
                標籤正確
              </button>
            </div>
          )}
        </section>

        {doc.sourceRef?.meetingId && (
          <div className="kb-field">
            <span className="kb-field-label">來源</span>
            {onOpenMeeting ? (
              <button
                type="button"
                className="kb-link"
                onClick={() => onOpenMeeting(doc.sourceRef!.meetingId!)}
              >
                回到這場會議（{doc.sourceRef.meetingId}）
              </button>
            ) : (
              <span className="kb-field-value">
                會議 {doc.sourceRef.meetingId}
              </span>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          className="kb-textarea"
          value={body}
          rows={20}
          onChange={(event) => setBody(event.target.value)}
        />
      ) : (
        <div className="kb-doc-body">
          {segments.map((segment, index) =>
            segment.highlighted ? (
              <mark key={index} className="kb-highlight" ref={scrollIntoView}>
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </div>
      )}
    </article>
  );
}

/** 掛載時把 highlight 捲進畫面。從問答點引文跳過來時，人要看到落點。 */
function scrollIntoView(node: HTMLElement | null) {
  node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

interface Segment {
  text: string;
  highlighted: boolean;
}

/** 依 highlight 區間把內文切成三段。區間無效時原樣回傳。 */
function splitForHighlight(
  body: string,
  highlight: { start: number; end: number } | null | undefined,
): Segment[] {
  if (
    !highlight ||
    highlight.start < 0 ||
    highlight.end > body.length ||
    highlight.start >= highlight.end
  ) {
    return [{ text: body, highlighted: false }];
  }

  return [
    { text: body.slice(0, highlight.start), highlighted: false },
    { text: body.slice(highlight.start, highlight.end), highlighted: true },
    { text: body.slice(highlight.end), highlighted: false },
  ].filter((segment) => segment.text.length > 0);
}
