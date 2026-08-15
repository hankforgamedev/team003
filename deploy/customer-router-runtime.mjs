import {
  CopyObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

const region = process.env.AWS_REGION ?? 'us-east-1';
const bucket = process.env.PIPELINE_BUCKET;
const sourcePrefix = trimSlashes(process.env.SOURCE_PREFIX ?? 'async-pipeline');
const customerPrefix = trimSlashes(process.env.CUSTOMER_PREFIX ?? 'customers');
const identityMapKey = process.env.IDENTITY_MAP_KEY ?? `${sourcePrefix}/config/customer-map.json`;
const s3 = new S3Client({ region });

export async function handler(event) {
  if (!bucket) throw new Error('Missing PIPELINE_BUCKET');

  const records = Array.isArray(event?.Records) ? event.Records : [];
  const results = [];
  for (const record of records) {
    const key = decodeURIComponent(record?.s3?.object?.key?.replace(/\+/g, ' ') ?? '');
    if (!key.startsWith(`${sourcePrefix}/crm/line_`) || !key.endsWith('_crm.json')) continue;
    results.push(await routeLineCrm(key));
  }
  return { routed: results.length, results };
}

async function routeLineCrm(crmKey) {
  const fileName = crmKey.slice(`${sourcePrefix}/crm/`.length);
  const baseName = fileName.slice(0, -'_crm.json'.length);
  const rawKey = `${sourcePrefix}/raw/${baseName}.txt`;
  const transcriptKey = `${sourcePrefix}/transcripts/${baseName}_transcript.txt`;

  const [rawText, crm, identityMap] = await Promise.all([
    readText(rawKey),
    readJson(crmKey),
    readIdentityMap(),
  ]);
  const metadata = parsePipelineMetadata(rawText);
  const subjectId = metadata.subject_id ?? parseLineSubjectId(baseName);
  const mappedCompany = identityMap.line?.[subjectId];
  const customer = sanitizeCustomerFolderName(mappedCompany ?? crm.company ?? '_unassigned');
  const customerPath = customer === '_unassigned'
    ? `${customer}/${makeAnonymousCustomerKey(subjectId)}`
    : customer;
  const destinationRoot = `${customerPrefix}/${customerPath}/line`;

  await Promise.all([
    copy(rawKey, `${destinationRoot}/raw/${baseName}.txt`),
    copy(transcriptKey, `${destinationRoot}/transcripts/${baseName}_transcript.txt`),
    copy(crmKey, `${destinationRoot}/crm/${baseName}_crm.json`),
  ]);

  console.log(JSON.stringify({ customer, channel: 'line', routedArtifacts: 3 }));
  return { customer, channel: 'line', routedArtifacts: 3 };
}

async function readText(key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body?.transformToString('utf8') ?? '';
}

async function readJson(key) {
  return JSON.parse(await readText(key));
}

async function readIdentityMap() {
  try {
    return await readJson(identityMapKey);
  } catch (error) {
    if (error?.name === 'NoSuchKey') return {};
    throw error;
  }
}

function parsePipelineMetadata(rawText) {
  const match = rawText.match(/<!-- pipeline-metadata\s*([\s\S]*?)\s*-->/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

function parseLineSubjectId(baseName) {
  return baseName.match(/^line_([UGR][a-zA-Z0-9]+)_/)?.[1] ?? 'unknown';
}

function sanitizeCustomerFolderName(value) {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  if (!normalized || ['unknown', '未知', '不明', 'null', 'n/a'].includes(normalized.toLowerCase())) {
    return '_unassigned';
  }
  return normalized
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || '_unassigned';
}

function makeAnonymousCustomerKey(subjectId) {
  const digest = createHash('sha256')
    .update(`line:${subjectId}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `contact-${digest}`;
}

async function copy(sourceKey, destinationKey) {
  const copySource = encodeURIComponent(`${bucket}/${sourceKey}`).replace(/%2F/g, '/');
  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: copySource,
    Key: destinationKey,
    MetadataDirective: 'COPY',
  }));
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, '');
}
