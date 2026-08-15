import { useState } from 'react';
import { DEMO_QUESTIONS } from '../core/seed.js';
import type { Answer, Citation } from '../core/types.js';

interface AskPanelProps {
  onAsk: (question: string) => Promise<Answer>;
  /** 點引文時跳回原文並 highlight。 */
  onOpenCitation: (citation: Citation) => void;
}

/**
 * 聊天式問答。
 *
 * 兩個設計重點：
 * 1. **答案一定附出處**，而且出處可以點回原文 —— 業務要拿這句話去跟客戶講，
 *    「AI 說的」不夠，得看到是公司哪份文件寫的。
 * 2. **引擎透明標示**，離線降級時明講。沿用 Sales Next 既有的慣例。
 */
export function AskPanel({ onAsk, onOpenCitation }: AskPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setQuestion(trimmed);
    try {
      setAnswer(await onAsk(trimmed));
    } finally {
      // 失敗時也要解鎖輸入框，不然使用者就卡死了。
      setPending(false);
    }
  };

  return (
    <section className="kb-ask" aria-label="知識庫問答">
      <form
        className="kb-ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
      >
        <input
          className="kb-input kb-ask-input"
          value={question}
          placeholder="問知識庫任何問題，例如：業務可以自己決定多少折扣？"
          onChange={(event) => setQuestion(event.target.value)}
          disabled={pending}
        />
        <button type="submit" className="kb-btn" disabled={pending}>
          {pending ? '查詢中…' : '問'}
        </button>
      </form>

      {!answer && !pending && (
        <div className="kb-ask-suggestions">
          <span className="kb-ask-suggestions-label">試試看：</span>
          {DEMO_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="kb-chip"
              onClick={() => void submit(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {answer && (
        <div className="kb-answer">
          <div className="kb-answer-head">
            <span className={`kb-engine kb-engine-${answer.engine}`}>
              {answer.engine === 'bedrock'
                ? 'AWS Bedrock 生成'
                : '內建檢索引擎'}
            </span>
            {answer.note && <span className="kb-answer-note">{answer.note}</span>}
          </div>

          <p className="kb-answer-text">{answer.text}</p>

          {answer.citations.length > 0 && (
            <div className="kb-citations">
              <div className="kb-citations-label">
                出處（{answer.citations.length}）
              </div>
              <ol className="kb-citation-list">
                {answer.citations.map((citation, index) => (
                  <li key={`${citation.docId}-${citation.start}`}>
                    <button
                      type="button"
                      className="kb-citation"
                      onClick={() => onOpenCitation(citation)}
                    >
                      <span className="kb-citation-index">[{index + 1}]</span>
                      <span className="kb-citation-body">
                        <span className="kb-citation-source">
                          {citation.docTitle}
                          <span className="kb-citation-path">
                            {citation.docPath ?? '未歸檔'}
                          </span>
                        </span>
                        <span className="kb-citation-text">
                          {citation.text.replace(/\s+/g, ' ').slice(0, 120)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
