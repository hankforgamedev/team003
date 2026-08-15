import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PipelineDocument, PipelineDocumentSink } from './types.js';

export interface LineWebhookRequest {
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined> | null;
}

export interface LineWebhookResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface LineEventSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineMessage {
  id: string;
  type: string;
  text?: string;
  fileName?: string;
  fileSize?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  packageId?: string;
  stickerId?: string;
}

export interface LineWebhookEvent {
  type: string;
  timestamp: number;
  source: LineEventSource;
  webhookEventId?: string;
  message?: LineMessage;
  deliveryContext?: { isRedelivery?: boolean };
}

export interface LineWebhookBody {
  destination?: string;
  events?: LineWebhookEvent[];
}

export interface LineWebhookHandlerOptions {
  channelSecret: string;
  sink: PipelineDocumentSink;
}

/** 驗證時必須傳入「尚未 JSON.parse 的原始 UTF-8 body」。 */
export function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret)
    .update(rawBody, 'utf8')
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** LINE webhook 只會提供部署後的新事件；每個 message event 轉成一份 raw 文件。 */
export function lineWebhookToDocuments(rawBody: string): PipelineDocument[] {
  const payload = JSON.parse(rawBody) as LineWebhookBody;
  if (!Array.isArray(payload.events)) throw new Error('LINE webhook 缺少 events 陣列');

  return payload.events
    .filter((event) => event.type === 'message' && Boolean(event.message))
    .map(lineEventToDocument);
}

export function lineEventToDocument(event: LineWebhookEvent): PipelineDocument {
  if (!event.message) throw new Error('LINE message event 缺少 message');
  const subjectId = conversationId(event.source);
  const senderId = event.source.userId ?? 'unknown-user';
  const occurredAt = new Date(event.timestamp).toISOString();
  const externalId = event.webhookEventId ?? event.message.id;

  return {
    source: 'line',
    externalId,
    subjectId,
    occurredAt,
    title: `LINE 對話｜${subjectId}`,
    body: [
      `- 時間：${occurredAt}`,
      `- 對話：${subjectId}`,
      `- 發送者：${senderId}`,
      `- 方向：客戶 → 官方帳號`,
      '',
      '## 訊息',
      renderLineMessage(event.message),
    ].join('\n'),
    metadata: {
      channel: 'line',
      direction: 'inbound',
      conversation_type: event.source.type,
      sender_id: senderId,
      message_id: event.message.id,
      message_type: event.message.type,
      redelivery: event.deliveryContext?.isRedelivery ?? false,
    },
  };
}

/**
 * Messaging API 不會把「官方帳號送出的訊息」再用 webhook 回傳。
 * 發送 LINE reply/push 成功後，呼叫這個 helper 才能保留雙向對話。
 */
export function lineOutboundMessageToDocument(input: {
  recipientId: string;
  text: string;
  requestId: string;
  sentAt?: string;
}): PipelineDocument {
  const occurredAt = input.sentAt ?? new Date().toISOString();
  return {
    source: 'line',
    externalId: input.requestId,
    subjectId: input.recipientId,
    occurredAt,
    title: `LINE 對話｜${input.recipientId}`,
    body: [
      `- 時間：${occurredAt}`,
      `- 對話：${input.recipientId}`,
      '- 發送者：官方帳號',
      '- 方向：官方帳號 → 客戶',
      '',
      '## 訊息',
      input.text,
    ].join('\n'),
    metadata: {
      channel: 'line',
      direction: 'outbound',
      recipient_id: input.recipientId,
      request_id: input.requestId,
      message_type: 'text',
    },
  };
}

export function createLineWebhookHandler(options: LineWebhookHandlerOptions) {
  return async (request: LineWebhookRequest): Promise<LineWebhookResponse> => {
    const rawBody = decodeBody(request);
    const signature = header(request.headers, 'x-line-signature');

    if (!signature || !verifyLineSignature(rawBody, signature, options.channelSecret)) {
      return jsonResponse(401, { error: 'invalid LINE signature' });
    }

    let documents: PipelineDocument[];
    try {
      documents = lineWebhookToDocuments(rawBody);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : 'invalid LINE webhook body',
      });
    }

    // LINE 的 webhook URL 驗證會送 events: []，必須正常回 200。
    const writes = await Promise.all(documents.map((document) => options.sink.write(document)));
    return jsonResponse(200, { accepted: writes.length });
  };
}

function conversationId(source: LineEventSource): string {
  if (source.type === 'group') return source.groupId ?? 'unknown-group';
  if (source.type === 'room') return source.roomId ?? 'unknown-room';
  return source.userId ?? 'unknown-user';
}

function renderLineMessage(message: LineMessage): string {
  switch (message.type) {
    case 'text':
      return message.text ?? '';
    case 'location':
      return [
        `[位置訊息] ${message.address ?? ''}`.trim(),
        message.latitude !== undefined && message.longitude !== undefined
          ? `${message.latitude}, ${message.longitude}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'file':
      return `[檔案訊息] ${message.fileName ?? message.id}${message.fileSize ? `（${message.fileSize} bytes）` : ''}`;
    case 'sticker':
      return `[貼圖] package=${message.packageId ?? 'unknown'} sticker=${message.stickerId ?? 'unknown'}`;
    default:
      return `[${message.type} 訊息] messageId=${message.id}`;
  }
}

function decodeBody(request: LineWebhookRequest): string {
  const body = request.body ?? '';
  return request.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
}

function header(
  headers: LineWebhookRequest['headers'],
  expectedName: string,
): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  return entry?.[1];
}

function jsonResponse(statusCode: number, value: unknown): LineWebhookResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  };
}
