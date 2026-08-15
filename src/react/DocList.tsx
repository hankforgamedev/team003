import type { KnowledgeDoc } from '../core/types.js';

interface DocListProps {
  docs: KnowledgeDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 有搜尋字串時顯示「N 筆符合」而不是「N 筆知識」。 */
  query?: string;
}

const TYPE_LABEL: Record<KnowledgeDoc['docType'], string> = {
  sop: 'SOP',
  faq: 'FAQ',
  catalog: '型錄',
  customer: '客戶',
  other: '文件',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 取一段沒有 Markdown 記號的預覽文字。 */
function preview(body: string): string {
  return body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

export function DocList({ docs, selectedId, onSelect, query }: DocListProps) {
  if (docs.length === 0) {
    return (
      <div className="kb-doc-list kb-doc-list-empty">
        <p className="kb-empty-hint">
          {query?.trim()
            ? `找不到符合「${query}」的知識。`
            : '這裡還沒有知識。上傳文件，或把會議 JSON 貼進來。'}
        </p>
      </div>
    );
  }

  return (
    <div className="kb-doc-list">
      <div className="kb-doc-list-head">
        {docs.length} 筆{query?.trim() ? '符合' : '知識'}
      </div>

      <ul className="kb-doc-items">
        {docs.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              className={`kb-doc-item${doc.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect(doc.id)}
              aria-current={doc.id === selectedId ? 'true' : undefined}
            >
              <div className="kb-doc-item-top">
                {doc.pinned && (
                  <span className="kb-pin" aria-label="已釘選">
                    📌
                  </span>
                )}
                <span className="kb-doc-title">{doc.title}</span>
                <span className={`kb-badge kb-badge-${doc.docType}`}>
                  {TYPE_LABEL[doc.docType]}
                </span>
              </div>

              <p className="kb-doc-preview">{preview(doc.body)}</p>

              <div className="kb-doc-item-meta">
                <span className="kb-doc-path">{doc.path}</span>
                <span className="kb-doc-date">{formatDate(doc.updatedAt)}</span>
                {doc.autoFiled && (
                  <span className="kb-badge kb-badge-auto">AI 歸檔待確認</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
