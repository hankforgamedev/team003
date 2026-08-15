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
 * 這裡是資料夾和標籤**唯一**的編輯入口 —— 兩者都是這份文件的欄位，
 * 在同一個地方改，使用者才會理解它們是同一筆知識的兩種面向。
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
  const [path, setPath] = useState(doc.path);
  const [tagDraft, setTagDraft] = useState('');

  // 切換到另一份文件時把編輯狀態重置，不然會把 A 的內容存到 B 身上。
  useEffect(() => {
    setEditing(false);
    setTitle(doc.title);
    setBody(doc.body);
    setPath(doc.path);
    setTagDraft('');
  }, [doc.id, doc.title, doc.body, doc.path]);

  const segments = useMemo(
    () => splitForHighlight(doc.body, highlight),
    [doc.body, highlight],
  );

  const save = () => {
    onSave({ ...doc, title, body, path, autoFiled: false });
    setEditing(false);
  };

  const addTag = () => {
    const tag = tagDraft.trim();
    if (!tag || doc.tags.includes(tag)) {
      setTagDraft('');
      return;
    }
    onSave({ ...doc, tags: [...doc.tags, tag] });
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    onSave({ ...doc, tags: doc.tags.filter((t) => t !== tag) });
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

      {doc.autoFiled && (
        <div className="kb-notice">
          這份知識是 AI 自動歸檔的，還沒有人確認過。
          <button
            type="button"
            className="kb-btn kb-btn-sm"
            onClick={() => onSave({ ...doc, autoFiled: false })}
          >
            位置正確
          </button>
        </div>
      )}

      <div className="kb-doc-meta">
        <label className="kb-field">
          <span className="kb-field-label">資料夾</span>
          {editing ? (
            <input
              className="kb-input"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          ) : (
            <span className="kb-field-value">{doc.path}</span>
          )}
        </label>

        <div className="kb-field">
          <span className="kb-field-label">標籤</span>
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
        </div>

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
