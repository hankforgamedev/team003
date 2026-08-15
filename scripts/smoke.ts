/**
 * 煙霧測試：跑一遍知識庫的主要路徑，確認核心邏輯真的會動。
 * 執行：npx tsx scripts/smoke.ts
 */
import { strict as assert } from 'node:assert';

import {
  ask,
  buildFolderTree,
  buildTagCounts,
  classifyDocument,
  classifyIntoFolder,
  classifyIntoTags,
  countUnfiled,
  countUntagged,
  coverage,
  DEMO_MEETING,
  filterByFolder,
  filterByTags,
  ingest,
  ingestMeetings,
  isFiled,
  isTagged,
  MemoryStore,
  moveFolder,
  normalizePath,
  prepareMeetingDoc,
  prepareTextDoc,
  S3Store,
  searchDocs,
  seed,
  tokenize,
  UNFILED,
} from '../src/index.js';
import { DEMO_MEETINGS } from '../src/core/seed.js';
import type { S3ClientLike } from '../src/index.js';
import type { KnowledgeDoc } from '../src/index.js';

/**
 * 假的 S3 client：把 bucket 當成一個 Map，記錄收到的指令。
 * 這樣不用連真的 AWS 就能驗 S3Store 的行為。
 */
function fakeS3(initial?: string) {
  const objects = new Map<string, string>();
  if (initial !== undefined) objects.set('knowledge-base.json', initial);
  const calls: string[] = [];

  const client: S3ClientLike = {
    async send(command: unknown) {
      const { constructor, input } = command as {
        constructor: { name: string };
        input: { Key: string; Body?: string };
      };
      const kind = constructor.name;
      calls.push(kind);

      if (kind === 'GetObjectCommand') {
        const body = objects.get(input.Key);
        if (body === undefined) {
          throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        }
        return {
          Body: { transformToString: async () => body },
          ETag: `"${body.length}"`,
        };
      }

      if (kind === 'PutObjectCommand') {
        const body = input.Body ?? '';
        objects.set(input.Key, body);
        return { ETag: `"${body.length}"` };
      }

      throw new Error(`未預期的指令：${kind}`);
    },
  };

  return { client, objects, calls };
}

/**
 * S3Store 用執行期字串 import SDK，測試環境沒裝 @aws-sdk/client-s3。
 * 這裡塞一個假的 sdk 進去，繞過載入但保留其餘所有邏輯。
 */
function makeS3Store(client: S3ClientLike, options: { ifMatch?: boolean } = {}) {
  class GetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  const store = new S3Store({ bucket: 'test-bucket', client, ...options });
  // 預先填好 sdk 快取，sdk() 就不會去 import 真的套件。
  (store as unknown as { sdkCache: unknown }).sdkCache = {
    S3Client: class {},
    GetObjectCommand,
    PutObjectCommand,
  };
  return store;
}

/** 測試用的文件工廠。 */
function makeDoc(overrides: Partial<KnowledgeDoc> = {}): KnowledgeDoc {
  return {
    id: 'd1',
    title: 't',
    body: 'b',
    path: null,
    tags: [],
    docType: 'other',
    source: 'paste',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

let passed = 0;
function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${label}`);
    })
    .catch((error: unknown) => {
      console.error(`  ✗ ${label}`);
      console.error(`    ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}

async function main() {
  console.log('\n路徑正規化與資料夾樹');

  await check('normalizePath 收斂各種寫法', () => {
    assert.equal(normalizePath('公司知識/SOP'), '/公司知識/SOP');
    assert.equal(normalizePath('/公司知識/SOP/'), '/公司知識/SOP');
    assert.equal(normalizePath('//公司知識//SOP//'), '/公司知識/SOP');
  });

  await check('未歸檔（null）不會被當成根目錄', () => {
    // 這是兩套系統獨立的關鍵前提：null 是「不在資料夾系統裡」，
    // 跟「放在根目錄」是兩回事，不能悄悄互換。
    assert.equal(normalizePath(null), null);
    assert.equal(normalizePath(undefined), null);
    assert.equal(normalizePath(''), null);
    assert.equal(normalizePath('/'), '/');
  });

  await check('中間層資料夾不會斷掉', () => {
    const tree = buildFolderTree([
      makeDoc({ path: '/公司知識/SOP/報價', docType: 'sop' }),
    ]);
    // 只放了一份最深層的文件，但 /公司知識 這層也要存在。
    const level1 = tree.children[0];
    assert.equal(level1?.path, '/公司知識');
    assert.equal(level1?.children[0]?.path, '/公司知識/SOP');
    assert.equal(tree.totalCount, 1);
  });

  await check('未歸檔的文件不會混進資料夾樹', () => {
    const tree = buildFolderTree([
      makeDoc({ id: 'a', path: '/公司知識/SOP' }),
      makeDoc({ id: 'b', path: null, tags: ['報價'] }),
    ]);
    // 有標籤但沒歸檔的那筆不該被算進任何一層。
    assert.equal(tree.totalCount, 1);
  });

  console.log('\n中文斷詞');

  await check('中文切出 unigram 和 bigram', () => {
    const tokens = tokenize('預算多少');
    assert.ok(tokens.includes('預算'), '要有 bigram「預算」');
    assert.ok(tokens.includes('多少'), '要有 bigram「多少」');
    assert.ok(tokens.includes('預'), '要有 unigram');
  });

  await check('中英數混合不會互相吃掉', () => {
    const tokens = tokenize('SOP 折扣 15%');
    assert.ok(tokens.includes('sop'));
    assert.ok(tokens.includes('15'));
    assert.ok(tokens.includes('折扣'));
  });

  console.log('\n自動分類（兩套各跑各的）');

  await check('資料夾分類器只決定資料夾', () => {
    const folder = classifyIntoFolder('報價與折扣授權 SOP', '本標準作業流程規範…');
    assert.equal(folder.path, '/公司知識/SOP');
    assert.equal(folder.docType, 'sop');
    assert.ok(folder.confidence > 0.4);
    // 回傳型別裡根本沒有 tags —— 這個分類器不碰標籤系統。
    assert.ok(!('tags' in folder));
  });

  await check('標籤分類器只決定標籤', () => {
    const tag = classifyIntoTags('報價與折扣授權 SOP', '折扣需要主管核准…');
    assert.ok(tag.tags.includes('報價'));
    assert.ok(tag.tags.includes('折扣'));
    assert.ok(!('path' in tag));
  });

  await check('標籤詞彙不含文件種類詞', () => {
    // 兩套系統的詞彙不重疊才是真的獨立：
    // 「SOP」是文件種類（資料夾的事），不該變成主題標籤。
    const tag = classifyIntoTags('SOP', '這是一份 SOP');
    assert.ok(!tag.tags.includes('SOP'), '「SOP」不該出現在標籤系統');
  });

  await check('一套猜得到、另一套猜不到是合法結果', () => {
    // 認得出是 FAQ（資料夾成立），但主題不在標籤規則裡（標籤系統掛零）。
    const result = classifyDocument('常見問題', '常見問題：今天星期幾？');
    assert.equal(result.folder.path, '/公司知識/FAQ');
    assert.deepEqual(result.tag.tags, []);
    assert.equal(result.tag.confidence, 0);

    // 反過來：認得出主題，但認不出是什麼種類的文件。
    const other = classifyDocument('備忘', '這次退費要走匯款');
    assert.equal(other.folder.path, null, '猜不出來就維持未歸檔');
    assert.ok(other.tag.tags.includes('退貨'));
    assert.ok(other.tag.tags.includes('付款'));
  });

  await check('猜不到時維持未分類，不塞進收件匣', () => {
    const result = classifyDocument('隨手筆記', '今天天氣不錯');
    assert.equal(result.folder.path, null);
    assert.deepEqual(result.tag.tags, []);
  });

  await check('mode 可以只啟用一套系統', () => {
    const folderOnly = classifyDocument('報價 SOP', '折扣流程', 'folder');
    assert.equal(folderOnly.folder.path, '/公司知識/SOP');
    assert.deepEqual(folderOnly.tag.tags, [], '標籤系統關掉就不該有結果');

    const tagOnly = classifyDocument('報價 SOP', '折扣流程', 'tag');
    assert.equal(tagOnly.folder.path, null, '資料夾系統關掉就不該歸檔');
    assert.ok(tagOnly.tag.tags.includes('折扣'));
  });

  await check('指定一套不會清掉另一套的自動結果', () => {
    // 使用者說「放這個資料夾」，AI 猜的標籤要留著。
    const { doc } = prepareTextDoc('折扣需要主管核准', {
      title: '報價規範',
      path: '/我的/自訂位置',
    });
    assert.equal(doc.path, '/我的/自訂位置');
    assert.equal(doc.autoFiled, false, '使用者指定的不算 AI 歸檔');
    assert.ok(doc.tags.includes('折扣'), 'AI 猜的標籤要保留');
    assert.equal(doc.autoTagged, true);
  });

  await check('可以明確指定不進資料夾系統', () => {
    const { doc } = prepareTextDoc('折扣需要主管核准', {
      title: '報價規範',
      path: null,
    });
    assert.equal(doc.path, null);
    assert.ok(doc.tags.length > 0, '標籤系統仍然照跑');
  });

  console.log('\n會議 JSON 沉澱');

  await check('五筆測資都跑得進來', async () => {
    assert.equal(DEMO_MEETINGS.length, 5);

    const store = new MemoryStore();
    const results = await ingestMeetings(store, DEMO_MEETINGS);
    assert.equal(results.length, 5);

    const docs = await store.listDocs();
    // 每筆會議一個客戶資料夾，公司名不重複。
    const paths = new Set(docs.map((d) => d.path));
    assert.equal(paths.size, 5);
  });

  await check('抽取稀疏的會議：歸得了檔但標不出標籤', async () => {
    // m_004 只有公司和需求，customer_type / plan / objection 全是 null。
    // 這是真實 pipeline 常見的結果，也正好證明兩套分類系統是獨立的。
    const sparse = DEMO_MEETINGS.find((m) => m.meeting_id === 'm_004');
    assert.ok(sparse, '應該要有 m_004 這筆稀疏測資');

    const { doc } = prepareMeetingDoc(sparse);
    assert.equal(doc.path, '/客戶知識/立盛物流', '公司名一定抽得到，歸檔成立');
    assert.deepEqual(doc.tags, [], '其餘欄位都是 null，標籤系統掛零');
  });

  await check('預算是字串時也格式化得出來', () => {
    // m_002 的預算是「每月五萬上下」而不是數字。
    const loose = DEMO_MEETINGS.find((m) => m.meeting_id === 'm_002');
    assert.ok(loose);
    const { doc } = prepareMeetingDoc(loose);
    assert.ok(doc.body.includes('每月五萬上下'));
  });

  await check('只啟用資料夾時不產生標籤', () => {
    const { doc } = prepareMeetingDoc(DEMO_MEETING, 'folder');
    assert.equal(doc.path, '/客戶知識/沐日食品');
    assert.deepEqual(doc.tags, []);
  });

  await check('只啟用標籤時不歸檔', () => {
    const { doc } = prepareMeetingDoc(DEMO_MEETING, 'tag');
    assert.equal(doc.path, null);
    assert.ok(doc.tags.includes('品牌方'));
  });

  await check('依公司名歸檔並保留原話', () => {
    const { doc } = prepareMeetingDoc(DEMO_MEETING);
    assert.equal(doc.path, '/客戶知識/沐日食品');
    assert.equal(doc.customer, '沐日食品');
    assert.equal(doc.sourceRef?.meetingId, 'm_001');
    assert.ok(doc.tags.includes('品牌方'));
    assert.ok(doc.tags.includes('決策者未出席'));
    assert.ok(
      doc.body.includes('我們今年這塊大概抓一百二左右'),
      '客戶原話要留在內文裡，才能當引文',
    );
    assert.ok(doc.body.includes('1,200,000 元'), '預算要格式化');
  });

  await check('貼上 JSON 字串會被自動辨識', async () => {
    const store = new MemoryStore();
    const result = await ingest(store, JSON.stringify(DEMO_MEETING));
    assert.equal(result.doc.docType, 'customer');
    assert.equal(result.doc.path, '/客戶知識/沐日食品');
  });

  console.log('\n兩套獨立分類系統');

  await check('四種分類狀態都成立', () => {
    const docs = [
      makeDoc({ id: 'both', path: '/公司知識/SOP', tags: ['報價'] }),
      makeDoc({ id: 'filedOnly', path: '/公司知識/SOP', tags: [] }),
      makeDoc({ id: 'taggedOnly', path: null, tags: ['報價'] }),
      makeDoc({ id: 'neither', path: null, tags: [] }),
    ];

    assert.deepEqual(
      docs.filter(isFiled).map((d) => d.id),
      ['both', 'filedOnly'],
    );
    assert.deepEqual(
      docs.filter(isTagged).map((d) => d.id),
      ['both', 'taggedOnly'],
    );
    assert.equal(countUnfiled(docs), 2);
    assert.equal(countUntagged(docs), 2);
  });

  await check('兩個視角篩出來的成員可以完全不同', () => {
    const docs = [
      makeDoc({ id: 'filedOnly', path: '/公司知識/SOP', tags: [] }),
      makeDoc({ id: 'taggedOnly', path: null, tags: ['報價'] }),
    ];

    // 資料夾視角只看得到 filedOnly，標籤視角只看得到 taggedOnly。
    // 這是兩套系統獨立最直接的後果 —— 不是同一份集合的兩種排列。
    assert.deepEqual(
      filterByFolder(docs, '/').map((d) => d.id),
      ['filedOnly'],
    );
    assert.deepEqual(
      filterByTags(docs, []).map((d) => d.id),
      ['taggedOnly'],
    );
  });

  await check('每套系統有自己的未分類桶子', () => {
    const docs = [
      makeDoc({ id: 'filedOnly', path: '/公司知識/SOP', tags: [] }),
      makeDoc({ id: 'taggedOnly', path: null, tags: ['報價'] }),
    ];

    // 未歸檔桶子裝的是 taggedOnly（它有標籤，但沒進資料夾系統）。
    assert.deepEqual(
      filterByFolder(docs, UNFILED).map((d) => d.id),
      ['taggedOnly'],
    );
    // 未標記桶子裝的是 filedOnly。兩個桶子的內容完全相反。
    assert.deepEqual(
      filterByTags(docs, [], 'and', true).map((d) => d.id),
      ['filedOnly'],
    );
  });

  await check('涵蓋率各算各的', () => {
    const docs = [
      makeDoc({ id: 'a', path: '/x', tags: ['報價'] }),
      makeDoc({ id: 'b', path: '/x', tags: [] }),
      makeDoc({ id: 'c', path: null, tags: [] }),
    ];
    assert.deepEqual(coverage(docs, 'folder'), {
      kind: 'folder',
      classified: 2,
      unclassified: 1,
      total: 3,
    });
    assert.deepEqual(coverage(docs, 'tag'), {
      kind: 'tag',
      classified: 1,
      unclassified: 2,
      total: 3,
    });
  });

  await check('改一套不會動到另一套', async () => {
    const store = new MemoryStore();
    const doc = await store.putDoc(
      makeDoc({ path: '/公司知識/SOP', tags: ['報價', '折扣'] }),
    );

    // 只改資料夾
    const moved = await store.putDoc({ ...doc, path: '/封存' });
    assert.deepEqual(moved.tags, ['報價', '折扣'], '標籤不該被動到');

    // 只改標籤
    const retagged = await store.putDoc({ ...moved, tags: ['合約'] });
    assert.equal(retagged.path, '/封存', '資料夾不該被動到');
  });

  await check('示範資料涵蓋四種狀態', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    assert.ok(countUnfiled(docs) > 0, '要有未歸檔的，才示範得出獨立性');
    assert.ok(countUntagged(docs) > 0, '要有未標記的');

    // 重點是兩套系統的**成員**不同，不是數量不同 ——
    // 各分類 5 筆但那 5 筆不是同一批，一樣證明是兩套系統。
    const filed = new Set(docs.filter(isFiled).map((d) => d.id));
    const tagged = new Set(docs.filter(isTagged).map((d) => d.id));
    assert.ok(
      [...filed].some((id) => !tagged.has(id)),
      '要有「歸了檔但沒標籤」的知識',
    );
    assert.ok(
      [...tagged].some((id) => !filed.has(id)),
      '要有「標了籤但沒歸檔」的知識',
    );
  });

  await check('多標籤是交集不是聯集', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();
    const both = filterByTags(docs, ['報價', '合約']);
    const one = filterByTags(docs, ['報價']);
    assert.ok(both.length < one.length, '交集應該更少');
  });

  await check('搬資料夾會連子資料夾一起搬', () => {
    const docs = [makeDoc({ path: '/公司知識/SOP/報價', docType: 'sop' })];
    const moved = moveFolder(docs, '/公司知識', '/封存/公司知識');
    assert.equal(moved[0]?.path, '/封存/公司知識/SOP/報價');

    assert.throws(
      () => moveFolder(docs, '/公司知識', '/公司知識/子層'),
      /不能把資料夾搬進自己的子資料夾/,
    );
  });

  await check('搬資料夾不會碰到未歸檔的文件', () => {
    const docs = [
      makeDoc({ id: 'a', path: '/公司知識/SOP' }),
      makeDoc({ id: 'b', path: null, tags: ['報價'] }),
    ];
    const moved = moveFolder(docs, '/公司知識', '/封存');
    assert.deepEqual(moved.map((d) => d.id), ['a']);
  });

  console.log('\n檢索與問答');

  await check('中文具名查詢找得到正確文件', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    const results = searchDocs(docs, '沐日食品的預算是多少');
    assert.ok(results.length > 0, '要有結果');
    assert.equal(
      results[0]?.doc.customer,
      '沐日食品',
      '最相關的應該是沐日食品那筆',
    );
  });

  await check('離線問答會附上可跳轉的出處', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    const answer = await ask(docs, '業務可以自己決定多少折扣？');
    assert.equal(answer.engine, 'offline');
    assert.ok(answer.citations.length > 0, '一定要有出處');

    const top = answer.citations[0]!;
    const source = docs.find((d) => d.id === top.docId)!;
    // 引文的字元區間必須真的對得回原文，UI 的 highlight 才不會標錯位置。
    assert.equal(source.body.slice(top.start, top.end).trim(), top.text);
    assert.ok(
      answer.citations.some((c) => c.text.includes('5%')),
      '應該引到折扣額度那段',
    );
  });

  await check('沒有相關內容時不會硬掰', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();
    const answer = await ask(docs, '量子力學的測不準原理');
    assert.equal(answer.citations.length, 0);
    assert.ok(answer.text.includes('找不到'));
  });

  await check('provider 掛掉會自動降級但保留出處', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    const answer = await ask(docs, '年約解約要付違約金嗎？', {
      provider: {
        name: 'bedrock',
        async complete() {
          throw new Error('模擬 Bedrock 斷線');
        },
      },
    });

    assert.equal(answer.engine, 'offline', '要降級');
    assert.ok(answer.note?.includes('模擬 Bedrock 斷線'));
    assert.ok(answer.citations.length > 0, '降級後出處還在');
  });

  await check('provider 正常時用它的回答', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    const answer = await ask(docs, '年約解約要付違約金嗎？', {
      provider: {
        name: 'bedrock',
        async complete({ context }) {
          assert.ok(context.length > 0, 'provider 要收到檢索結果');
          return '年約中途解約需支付剩餘月份 30% 作為違約金 [1]。';
        },
      },
    });

    assert.equal(answer.engine, 'bedrock');
    assert.ok(answer.text.includes('30%'));
  });

  console.log('\n儲存層');

  await check('put 會補 id、正規化路徑、去重標籤', async () => {
    const store = new MemoryStore();
    const doc = await store.putDoc({
      title: 't',
      body: 'b',
      path: '公司知識//SOP/',
      tags: ['SOP', 'SOP', ' 折扣 ', ''],
      docType: 'sop',
      source: 'paste',
    });
    assert.ok(doc.id.startsWith('doc_'));
    assert.equal(doc.path, '/公司知識/SOP');
    assert.deepEqual(doc.tags, ['SOP', '折扣']);
  });

  await check('更新會保留 createdAt 並推進 updatedAt', async () => {
    const store = new MemoryStore();
    const first = await store.putDoc({
      title: 't',
      body: 'b',
      path: '/x',
      tags: [],
      docType: 'other',
      source: 'paste',
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.putDoc({ ...first, title: 't2' });

    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
    assert.ok(second.updatedAt >= first.updatedAt);
    assert.equal((await store.listDocs()).length, 1, '不該變成兩筆');
  });

  await check('S3：物件不存在時視為空知識庫', async () => {
    const { client } = fakeS3();
    const store = makeS3Store(client);
    // 第一次開啟時 bucket 裡什麼都沒有，不該炸掉。
    assert.deepEqual(await store.listDocs(), []);
  });

  await check('S3：寫進去的是一個 JSON 物件', async () => {
    const { client, objects } = fakeS3();
    const store = makeS3Store(client);
    await store.putDoc(makeDoc({ id: undefined, title: '報價 SOP' }));

    const raw = objects.get('knowledge-base.json');
    assert.ok(raw, '應該寫進預設 key');
    const parsed = JSON.parse(raw) as { docs: unknown[] };
    assert.equal(parsed.docs.length, 1);
  });

  await check('S3：讀得回自己寫的資料', async () => {
    const { client } = fakeS3();
    const store = makeS3Store(client);
    const saved = await store.putDoc(
      makeDoc({ id: undefined, title: '交接流程', tags: ['交付'] }),
    );

    const docs = await store.listDocs();
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.title, '交接流程');
    assert.deepEqual((await store.getDoc(saved.id))?.tags, ['交付']);
  });

  await check('S3：壞掉的 JSON 不會讓知識庫開不起來', async () => {
    const { client } = fakeS3('這不是 JSON {{{');
    const store = makeS3Store(client);
    assert.deepEqual(await store.listDocs(), []);
  });

  await check('S3：5 筆會議測資完整跑一輪', async () => {
    const { client, objects } = fakeS3();
    const store = makeS3Store(client);

    await ingestMeetings(store, DEMO_MEETINGS);

    const docs = await store.listDocs();
    assert.equal(docs.length, 5, '五筆都要進得去');

    // 存到 S3 的內容要能原封不動讀回來（序列化不掉東西）。
    const parsed = JSON.parse(objects.get('knowledge-base.json') as string) as {
      docs: KnowledgeDoc[];
    };
    assert.equal(parsed.docs.length, 5);
    assert.ok(
      parsed.docs.every((d) => d.path?.startsWith('/客戶知識/')),
      '五筆都應該歸到客戶知識底下',
    );
  });

  await check('S3：ifMatch 關閉時不帶樂觀鎖', async () => {
    const { client, calls } = fakeS3();
    const store = makeS3Store(client);
    await store.putDoc(makeDoc({ id: undefined }));
    // 讀一次、寫一次，沒有多餘往返。
    assert.deepEqual(calls, ['GetObjectCommand', 'PutObjectCommand']);
  });

  await check('標籤統計依數量排序', async () => {
    const store = new MemoryStore();
    await seed(store);
    const counts = buildTagCounts(await store.listDocs());
    assert.ok(counts.length > 0);
    for (let i = 1; i < counts.length; i++) {
      assert.ok(counts[i - 1]!.count >= counts[i]!.count, '要由多到少');
    }
  });

  console.log(
    `\n${process.exitCode ? '有測試失敗' : `全部通過（${passed} 項）`}\n`,
  );
}

void main();
