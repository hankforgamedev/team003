import { loadOptional } from '../core/load-module.js';
import { createLineWebhookHandler } from './line.js';
import { S3RawDocumentSink } from './s3-pipeline.js';
import type { LineWebhookRequest, LineWebhookResponse } from './line.js';

type CommandCtor = new (input: Record<string, unknown>) => unknown;

interface SecretsManagerSdk {
  SecretsManagerClient: new (config: Record<string, unknown>) => {
    send(command: unknown): Promise<unknown>;
  };
  GetSecretValueCommand: CommandCtor;
}

let runtime:
  | Promise<(request: LineWebhookRequest) => Promise<LineWebhookResponse>>
  | undefined;

/** AWS Lambda handler：API Gateway HTTP API payload v2 可直接傳入。 */
export async function handler(
  request: LineWebhookRequest,
): Promise<LineWebhookResponse> {
  runtime ??= initialize();
  return (await runtime)(request);
}

async function initialize() {
  const bucket = requiredEnv('PIPELINE_BUCKET');
  const secretId = requiredEnv('LINE_CHANNEL_SECRET_ID');
  const prefix = process.env.PIPELINE_PREFIX ?? 'async-pipeline/raw';
  const region = process.env.AWS_REGION;
  const sdk = (await loadOptional(
    '@aws-sdk/client-secrets-manager',
    'LINE webhook Lambda',
  )) as SecretsManagerSdk;
  const client = new sdk.SecretsManagerClient(region ? { region } : {});
  const response = (await client.send(
    new sdk.GetSecretValueCommand({ SecretId: secretId }),
  )) as { SecretString?: string; SecretBinary?: Uint8Array };
  const rawSecret =
    response.SecretString ??
    (response.SecretBinary
      ? Buffer.from(response.SecretBinary).toString('utf8')
      : undefined);
  if (!rawSecret) throw new Error(`Secrets Manager ${secretId} 沒有 SecretString`);

  return createLineWebhookHandler({
    channelSecret: extractChannelSecret(rawSecret),
    sink: new S3RawDocumentSink({ bucket, region, prefix }),
  });
}

function extractChannelSecret(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      channelSecret?: string;
      channel_secret?: string;
      LINE_CHANNEL_SECRET?: string;
    };
    return (
      parsed.channelSecret ??
      parsed.channel_secret ??
      parsed.LINE_CHANNEL_SECRET ??
      raw
    );
  } catch {
    return raw;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少環境變數 ${name}`);
  return value;
}
