export interface CustomerIdentityMap {
  line?: Record<string, string>;
}

export interface CustomerRouteInput {
  channel: 'line';
  subjectId: string;
  identityMap: CustomerIdentityMap;
  extractedCompany?: string | null;
}

export interface CustomerArtifactKeys {
  raw: string;
  transcript: string;
  crm: string;
}

const UNKNOWN_COMPANY_VALUES = new Set([
  '',
  'unknown',
  '未知',
  '不明',
  'null',
  'n/a',
]);

export function sanitizeCustomerFolderName(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80);
  return cleaned || '_unassigned';
}

export function resolveCustomerFolder(input: CustomerRouteInput): string {
  const mapped = input.identityMap[input.channel]?.[input.subjectId]?.trim();
  if (mapped) return sanitizeCustomerFolderName(mapped);

  const extracted = input.extractedCompany?.trim() ?? '';
  if (!UNKNOWN_COMPANY_VALUES.has(extracted.toLowerCase())) {
    return sanitizeCustomerFolderName(extracted);
  }

  return '_unassigned';
}

export function makeAnonymousCustomerKey(channel: string, subjectId: string): string {
  const digest = createHash('sha256')
    .update(`${channel}:${subjectId}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `contact-${digest}`;
}

export function buildCustomerArtifactKeys(options: {
  baseName: string;
  customerFolder: string;
  subjectId?: string;
  sourcePrefix?: string;
  customerPrefix?: string;
}): { source: CustomerArtifactKeys; destination: CustomerArtifactKeys } {
  const sourcePrefix = trimSlashes(options.sourcePrefix ?? 'async-pipeline');
  const customerPrefix = trimSlashes(options.customerPrefix ?? 'customers');
  const customerFolder = sanitizeCustomerFolderName(options.customerFolder);
  const customerPath = customerFolder === '_unassigned' && options.subjectId
    ? `${customerFolder}/${makeAnonymousCustomerKey('line', options.subjectId)}`
    : customerFolder;
  const baseName = options.baseName.replace(/[\\/]+/g, '_');

  return {
    source: {
      raw: `${sourcePrefix}/raw/${baseName}.txt`,
      transcript: `${sourcePrefix}/transcripts/${baseName}_transcript.txt`,
      crm: `${sourcePrefix}/crm/${baseName}_crm.json`,
    },
    destination: {
      raw: `${customerPrefix}/${customerPath}/line/raw/${baseName}.txt`,
      transcript: `${customerPrefix}/${customerPath}/line/transcripts/${baseName}_transcript.txt`,
      crm: `${customerPrefix}/${customerPath}/line/crm/${baseName}_crm.json`,
    },
  };
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
import { createHash } from 'node:crypto';
