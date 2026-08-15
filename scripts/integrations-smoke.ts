import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  buildCustomerArtifactKeys,
  createGoogleCalendarSyncHandler,
  createLineWebhookHandler,
  GoogleCalendarSyncTokenExpiredError,
  googleCalendarEventToDocument,
  lineOutboundMessageToDocument,
  makeAnonymousCustomerKey,
  makeRawObjectKey,
  renderPipelineDocument,
  resolveCustomerFolder,
  sanitizeCustomerFolderName,
  syncGoogleCalendar,
  verifyLineSignature,
  type GoogleCalendarEventsClient,
  type PipelineDocument,
  type PipelineDocumentSink,
  type SyncStateStore,
} from '../src/integrations/index.js';

let passed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

class CaptureSink implements PipelineDocumentSink {
  documents: PipelineDocument[] = [];
  async write(document: PipelineDocument) {
    this.documents.push(document);
    return { location: makeRawObjectKey(document) };
  }
}

class MemoryState implements SyncStateStore {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key);
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
}

async function main() {
  console.log('\nLINE／Google Calendar integrations');

  await check('LINE 使用未修改 raw body 做 HMAC-SHA256 驗簽', () => {
    const secret = 'test-secret';
    const body = '{"destination":"x","events":[]}';
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    assert.equal(verifyLineSignature(body, signature, secret), true);
    assert.equal(verifyLineSignature(`${body}\n`, signature, secret), false);
  });

  await check('偽造 LINE webhook 不會寫入 sink', async () => {
    const sink = new CaptureSink();
    const handler = createLineWebhookHandler({ channelSecret: 'secret', sink });
    const response = await handler({
      body: '{"events":[]}',
      headers: { 'x-line-signature': 'fake' },
    });
    assert.equal(response.statusCode, 401);
    assert.equal(sink.documents.length, 0);
  });

  await check('真實形狀的 LINE 訊息轉成可冪等 raw 文件', async () => {
    const sink = new CaptureSink();
    const secret = 'secret';
    const body = JSON.stringify({
      destination: 'bot',
      events: [
        {
          type: 'message',
          timestamp: 1786723200000,
          webhookEventId: '01K2ABC',
          deliveryContext: { isRedelivery: true },
          source: { type: 'user', userId: 'U123' },
          message: { id: 'm1', type: 'text', text: '下週三可以約嗎？' },
        },
      ],
    });
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    const handler = createLineWebhookHandler({ channelSecret: secret, sink });
    const response = await handler({
      body,
      headers: { 'X-Line-Signature': signature },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(sink.documents.length, 1);
    assert.equal(sink.documents[0]?.externalId, '01K2ABC');
    assert.ok(sink.documents[0]?.body.includes('下週三可以約嗎？'));
    assert.equal(
      makeRawObjectKey(sink.documents[0]!),
      makeRawObjectKey(sink.documents[0]!),
      '重送的 key 必須相同',
    );
  });

  await check('LINE outbound helper 能補齊官方帳號送出的半邊對話', () => {
    const document = lineOutboundMessageToDocument({
      recipientId: 'U123',
      requestId: 'req-1',
      text: '下週三下午兩點可以。',
      sentAt: '2026-08-15T02:00:00.000Z',
    });
    assert.equal(document.metadata.direction, 'outbound');
    assert.ok(renderPipelineDocument(document).includes('下午兩點'));
  });

  await check('Calendar 事件保留時間、參與者、說明與取消狀態', () => {
    const document = googleCalendarEventToDocument(
      {
        id: 'event-1',
        status: 'cancelled',
        summary: '客戶訪談',
        updated: '2026-08-15T03:00:00Z',
        start: { dateTime: '2026-08-20T14:00:00+08:00' },
        end: { dateTime: '2026-08-20T15:00:00+08:00' },
        description: '討論報價',
        attendees: [{ email: 'client@example.com', responseStatus: 'accepted' }],
      },
      'primary',
    );
    assert.equal(document.deleted, true);
    assert.ok(document.body.includes('client@example.com'));
    assert.ok(document.body.includes('討論報價'));
  });

  await check('Calendar 分頁全部成功後才交付 nextSyncToken', async () => {
    const sink = new CaptureSink();
    const calls: string[] = [];
    const client: GoogleCalendarEventsClient = {
      async listEvents(options) {
        calls.push(options.pageToken ?? 'first');
        return options.pageToken
          ? { items: [{ id: 'b', summary: 'B' }], nextSyncToken: 'sync-2' }
          : { items: [{ id: 'a', summary: 'A' }], nextPageToken: 'page-2' };
      },
    };
    const result = await syncGoogleCalendar({
      client,
      sink,
      calendarId: 'primary',
      syncToken: 'sync-1',
    });
    assert.deepEqual(calls, ['first', 'page-2']);
    assert.equal(sink.documents.length, 2);
    assert.equal(result.nextSyncToken, 'sync-2');
    assert.equal(result.fullSync, false);
  });

  await check('Calendar token 失效時自動全量重同步並保存新 token', async () => {
    const sink = new CaptureSink();
    const state = new MemoryState();
    state.values.set('calendar', 'expired');
    const seen: Array<string | undefined> = [];
    const client: GoogleCalendarEventsClient = {
      async listEvents(options) {
        seen.push(options.syncToken);
        if (options.syncToken) throw new GoogleCalendarSyncTokenExpiredError();
        return { items: [{ id: 'fresh' }], nextSyncToken: 'new-token' };
      },
    };
    const handler = createGoogleCalendarSyncHandler({
      client,
      sink,
      stateStore: state,
      stateKey: 'calendar',
      calendarId: 'primary',
    });
    const result = await handler();
    assert.deepEqual(seen, ['expired', undefined]);
    assert.equal(result.fullSync, true);
    assert.equal(state.values.get('calendar'), 'new-token');
  });

  await check('Customer Router 優先使用人工 LINE 身分對照', () => {
    assert.equal(resolveCustomerFolder({
      channel: 'line',
      subjectId: 'U123',
      identityMap: { line: { U123: '老哥電器' } },
      extractedCompany: '模型猜錯公司',
    }), '老哥電器');
  });

  await check('Customer Router 無法識別時放入 _unassigned', () => {
    assert.equal(resolveCustomerFolder({
      channel: 'line',
      subjectId: 'U404',
      identityMap: {},
      extractedCompany: null,
    }), '_unassigned');
  });

  await check('Customer Router 產生根目錄 customers/公司/line 結構', () => {
    const keys = buildCustomerArtifactKeys({
      baseName: 'line_U123_2026-08-15_EVT1',
      customerFolder: '老哥電器',
    });
    assert.equal(
      keys.destination.raw,
      'customers/老哥電器/line/raw/line_U123_2026-08-15_EVT1.txt',
    );
    assert.equal(
      keys.destination.transcript,
      'customers/老哥電器/line/transcripts/line_U123_2026-08-15_EVT1_transcript.txt',
    );
    assert.equal(
      keys.destination.crm,
      'customers/老哥電器/line/crm/line_U123_2026-08-15_EVT1_crm.json',
    );
  });

  await check('客戶資料夾名稱不允許跳脫 S3 路徑', () => {
    assert.equal(sanitizeCustomerFolderName('../王氏/科技'), '_王氏_科技');
  });

  await check('不同未辨識 LINE 身分進入不同匿名資料夾', () => {
    const first = makeAnonymousCustomerKey('line', 'U123');
    const same = makeAnonymousCustomerKey('line', 'U123');
    const second = makeAnonymousCustomerKey('line', 'U456');
    assert.equal(first, same);
    assert.notEqual(first, second);
    assert.match(first, /^contact-[a-f0-9]{16}$/);

    const keys = buildCustomerArtifactKeys({
      baseName: 'line_U123_2026-08-15_EVT2',
      customerFolder: '_unassigned',
      subjectId: 'U123',
    });
    assert.ok(keys.destination.crm.startsWith(`customers/_unassigned/${first}/line/crm/`));
  });

  console.log(`\n${process.exitCode ? '整合測試失敗' : `整合測試全部通過（${passed} 項）`}\n`);
}

void main();
