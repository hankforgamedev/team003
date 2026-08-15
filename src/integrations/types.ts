/**
 * LINE／Google Calendar 與既有黑盒子之間唯一共用的資料契約。
 *
 * integrations 只負責「可靠地把來源資料變成一份可處理的文字」，不負責
 * CRM 合併、知識庫建索引或問答。後續如果要改送 SQS、HTTP 或別的 pipeline，
 * 只要換掉 `PipelineDocumentSink`，來源 adapter 不需要重寫。
 */
export type PipelineSource = 'line' | 'google-calendar';

export type PipelineMetadataValue = string | number | boolean | null;

export interface PipelineDocument {
  source: PipelineSource;
  /** 來源系統的穩定 ID。sink 應以此做冪等 key，重送不產生重複資料。 */
  externalId: string;
  /** 用來把同一段對話或同一份日曆的資料串起來。 */
  subjectId: string;
  occurredAt: string;
  title: string;
  /** 給既有文字 pipeline／Bedrock 讀的主體。 */
  body: string;
  metadata: Record<string, PipelineMetadataValue>;
  /** 取消或刪除事件仍要送下游，讓下游有機會淘汰舊知識。 */
  deleted?: boolean;
}

export interface PipelineWriteResult {
  /** 例如 S3 object key。不是所有 sink 都需要回傳。 */
  location?: string;
}

export interface PipelineDocumentSink {
  write(document: PipelineDocument): Promise<PipelineWriteResult>;
}

export interface SyncStateStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

/**
 * 以機器可讀的 JSON metadata 開頭，後面保留乾淨文字給既有黑盒子處理。
 * 不要求下游理解新 schema；不知道 metadata 的處理器仍會把它當普通文字。
 */
export function renderPipelineDocument(document: PipelineDocument): string {
  const metadata = {
    source: document.source,
    external_id: document.externalId,
    subject_id: document.subjectId,
    occurred_at: document.occurredAt,
    deleted: document.deleted ?? false,
    ...document.metadata,
  };

  return [
    '<!-- pipeline-metadata',
    JSON.stringify(metadata, null, 2),
    '-->',
    '',
    `# ${document.title}`,
    '',
    document.body.trim(),
    '',
  ].join('\n');
}
