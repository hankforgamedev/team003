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
  DEMO_MEETING,
  filterByFolder,
  filterByTags,
  ingest,
  MemoryStore,
  moveFolder,
  normalizePath,
  prepareMeetingDoc,
  searchDocs,
  seed,
  tokenize,
} from '../src/index.js';

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
    assert.equal(normalizePath(''), '/');
  });

  await check('中間層資料夾不會斷掉', () => {
    const tree = buildFolderTree([
      {
        id: 'a',
        title: 't',
        body: 'b',
        path: '/公司知識/SOP/報價',
        tags: [],
        docType: 'sop',
        source: 'paste',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    // 只放了一份最深層的文件，但 /公司知識 這層也要存在。
    const level1 = tree.children[0];
    assert.equal(level1?.path, '/公司知識');
    assert.equal(level1?.children[0]?.path, '/公司知識/SOP');
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

  console.log('\n自動歸檔');

  await check('SOP 文件歸到 SOP 資料夾', () => {
    const result = classifyDocument('報價與折扣授權 SOP', '本標準作業流程規範…');
    assert.equal(result.path, '/公司知識/SOP');
    assert.ok(result.tags.includes('SOP'));
    assert.ok(result.tags.includes('折扣'), '應該自動標上「折扣」');
    assert.ok(result.confidence > 0.4);
  });

  await check('猜不到的丟進待整理，而不是根目錄', () => {
    const result = classifyDocument('隨手筆記', '今天天氣不錯');
    assert.equal(result.path, '/待整理');
    assert.ok(result.confidence < 0.4, '把握度要低，UI 才會提示確認');
  });

  console.log('\n會議 JSON 沉澱');

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

  console.log('\n兩種視角');

  await check('資料夾與標籤篩的是同一份資料', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();

    const byFolder = filterByFolder(docs, '/公司知識/SOP');
    assert.ok(byFolder.length >= 2, 'SOP 資料夾要有文件');

    const byTag = filterByTags(docs, ['SOP']);
    // 同一批知識，兩種視角都找得到 —— 這就是「一份資料兩種渲染」。
    assert.deepEqual(
      byFolder.map((d) => d.id).sort(),
      byTag.map((d) => d.id).sort(),
    );
  });

  await check('多標籤是交集不是聯集', async () => {
    const store = new MemoryStore();
    await seed(store);
    const docs = await store.listDocs();
    const both = filterByTags(docs, ['SOP', '折扣']);
    const sopOnly = filterByTags(docs, ['SOP']);
    assert.ok(both.length < sopOnly.length, '交集應該更少');
  });

  await check('搬資料夾會連子資料夾一起搬', () => {
    const docs = [
      {
        id: 'a',
        title: 't',
        body: 'b',
        path: '/公司知識/SOP/報價',
        tags: [],
        docType: 'sop' as const,
        source: 'paste' as const,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const moved = moveFolder(docs, '/公司知識', '/封存/公司知識');
    assert.equal(moved[0]?.path, '/封存/公司知識/SOP/報價');

    assert.throws(
      () => moveFolder(docs, '/公司知識', '/公司知識/子層'),
      /不能把資料夾搬進自己的子資料夾/,
    );
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
