import { createHmac, timingSafeEqual } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION ?? 'us-east-1';
const bucket = process.env.PIPELINE_BUCKET;
const prefix = (process.env.PIPELINE_PREFIX ?? 'async-pipeline/raw').replace(/^\/+|\/+$/g, '');
const secretId = process.env.LINE_CHANNEL_SECRET_ID;
const s3 = new S3Client({ region });
const secrets = new SecretsManagerClient({ region });
let channelSecret;

export async function handler(request) {
  if (!bucket || !secretId) throw new Error('Missing PIPELINE_BUCKET or LINE_CHANNEL_SECRET_ID');
  const rawBody = request.isBase64Encoded
    ? Buffer.from(request.body ?? '', 'base64').toString('utf8')
    : (request.body ?? '');
  const signature = Object.entries(request.headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'x-line-signature',
  )?.[1];

  if (!signature || !(await verify(rawBody, signature))) {
    return response(401, { error: 'invalid LINE signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response(400, { error: 'invalid JSON' });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const messages = events.filter((event) => event.type === 'message' && event.message);
  await Promise.all(messages.map(writeMessage));
  return response(200, { accepted: messages.length });
}

async function verify(rawBody, signature) {
  channelSecret ??= await loadSecret();
  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function loadSecret() {
  const value = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = value.SecretString ?? Buffer.from(value.SecretBinary ?? []).toString('utf8');
  try {
    const parsed = JSON.parse(raw);
    return parsed.channelSecret ?? parsed.channel_secret ?? parsed.LINE_CHANNEL_SECRET ?? raw;
  } catch {
    return raw;
  }
}

async function writeMessage(event) {
  const message = event.message;
  const subjectId = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId ?? 'unknown';
  const senderId = event.source?.userId ?? 'unknown-user';
  const externalId = event.webhookEventId ?? message.id;
  const occurredAt = new Date(event.timestamp).toISOString();
  const day = occurredAt.slice(0, 10);
  const key = `${prefix}/line_${safe(subjectId)}_${day}_${safe(externalId)}.txt`;
  const text = message.type === 'text'
    ? message.text ?? ''
    : `[${message.type} message] messageId=${message.id}`;
  const body = [
    '<!-- pipeline-metadata',
    JSON.stringify({
      source: 'line',
      external_id: externalId,
      subject_id: subjectId,
      occurred_at: occurredAt,
      direction: 'inbound',
      sender_id: senderId,
      message_id: message.id,
      message_type: message.type,
      redelivery: event.deliveryContext?.isRedelivery ?? false,
    }, null, 2),
    '-->',
    '',
    `# LINE 對話｜${subjectId}`,
    '',
    `- 時間：${occurredAt}`,
    `- 發送者：${senderId}`,
    '- 方向：客戶 → 官方帳號',
    '',
    '## 訊息',
    text,
    '',
  ].join('\n');

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'text/plain; charset=utf-8',
  }));
}

function safe(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'unknown';
}

function response(statusCode, value) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  };
}
