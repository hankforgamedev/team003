import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { S3Store } from '../src/index.js';
import {
  BEDROCK_CLAUDE_MODEL,
  BEDROCK_EMBED_MODEL,
  cosine,
  createBedrockEmbedder,
  createBedrockProvider,
} from '../src/providers/bedrock.js';
import type { Citation } from '../src/core/types.js';

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
const bucket = process.env.KB_S3_BUCKET;
const claudeModel = process.env.BEDROCK_CLAUDE_MODEL ?? BEDROCK_CLAUDE_MODEL;
const embedModel = process.env.BEDROCK_EMBED_MODEL ?? BEDROCK_EMBED_MODEL;
const keepObject = process.env.KEEP_AWS_TEST_OBJECT === '1';

if (!region) {
  throw new Error('缺少 AWS_REGION（例如 ap-northeast-1 或 us-east-1）');
}
if (!bucket) {
  throw new Error('缺少 KB_S3_BUCKET；請指定允許測試寫入的既有 bucket');
}
const awsRegion: string = region;
const s3Bucket: string = bucket;

// 每次使用唯一 key，絕不覆蓋正式 knowledge-base.json。
const key =
  process.env.KB_S3_KEY ??
  `codex-integration-tests/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.json`;

const s3Client = new S3Client({ region: awsRegion });
let attemptedS3Write = false;

async function verifyS3(): Promise<void> {
  const store = new S3Store({
    bucket: s3Bucket,
    key,
    region: awsRegion,
    ifMatch: true,
  });

  assert.deepEqual(await store.listDocs(), [], '新的測試 key 應該是空知識庫');

  attemptedS3Write = true;
  const saved = await store.putDoc({
    title: 'Codex AWS 整合測試',
    body: '退款申請須於購買後七日內提出。',
    path: '/整合測試',
    tags: ['aws', 'bedrock', 's3'],
    docType: 'sop',
    source: 'paste',
  });

  const docs = await store.listDocs();
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.id, saved.id);
  assert.equal(docs[0]?.body, '退款申請須於購買後七日內提出。');

  console.log(`✓ S3Store 真實寫入與讀回成功（s3://${s3Bucket}/${key}）`);
}

async function verifyClaude(): Promise<void> {
  const context: Citation[] = [
    {
      docId: 'aws-live-test',
      docTitle: '退款政策',
      docPath: '/整合測試',
      start: 0,
      end: 16,
      text: '退款申請須於購買後七日內提出。',
      score: 1,
    },
  ];

  const provider = createBedrockProvider({
    region: awsRegion,
    model: claudeModel,
    effort: 'low',
    maxTokens: 512,
  });
  const answer = await provider.complete({
    question: '退款申請期限是多久？',
    context,
  });

  assert.match(answer, /七日|7\s*日/);
  console.log(`✓ Claude 真實回答成功（${claudeModel}）：${answer.replace(/\s+/g, ' ')}`);
}

async function verifyEmbedding(): Promise<void> {
  const embedder = createBedrockEmbedder({ region: awsRegion, model: embedModel });
  const [question, policy] = await embedder.embed([
    '退款可以在幾天內申請？',
    '退款申請須於購買後七日內提出。',
  ]);

  assert.ok(question && policy, 'Titan 必須回傳兩個向量');
  assert.equal(question.length, policy.length, '向量維度必須一致');
  assert.ok(question.length > 0, '向量不可為空');
  assert.ok(question.every(Number.isFinite), '問題向量必須全部是有限數字');
  assert.ok(policy.every(Number.isFinite), '文件向量必須全部是有限數字');

  console.log(
    `✓ Titan embedding 成功（${embedModel}，${question.length} 維，cosine=${cosine(question, policy).toFixed(4)}）`,
  );
}

async function main(): Promise<void> {
  console.log(`AWS 真實整合測試：region=${awsRegion}`);
  let testError: unknown;
  try {
    const failures: Error[] = [];
    const checks: Array<[name: string, run: () => Promise<void>]> = [
      ['S3Store', verifyS3],
      ['Claude', verifyClaude],
      ['Titan embedding', verifyEmbedding],
    ];

    for (const [name, run] of checks) {
      try {
        await run();
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        failures.push(failure);
        console.error(`✗ ${name} 失敗：${failure.message}`);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} 項 AWS 整合檢查失敗`);
    }
    console.log('✓ AWS 真實整合測試全部通過');
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    if (attemptedS3Write && keepObject) {
      console.log(`保留測試物件：s3://${s3Bucket}/${key}`);
    } else if (attemptedS3Write) {
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
        console.log(`✓ 已刪除測試物件：s3://${s3Bucket}/${key}`);
      } catch (cleanupError) {
        if (!testError) throw cleanupError;
        console.error(`⚠ 測試失敗後也無法刪除 S3 測試物件：${String(cleanupError)}`);
      }
    }
  }
}

await main();
