import { createHash } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3";
import type {
  LineCrmSnapshot,
  LineIntegrationRecord,
  LineIntegrationStatus,
  LineRecordsResponse,
} from "@/lib/integrations/line-types";

const bucket = process.env.SALES_NEXT_S3_BUCKET?.trim() || "taoyuan-hsinchu2";
const region =
  process.env.SALES_NEXT_AWS_REGION?.trim() ||
  process.env.BEDROCK_AWS_REGION?.trim() ||
  process.env.AWS_REGION?.trim() ||
  "us-east-1";
const accountName = process.env.SALES_NEXT_LINE_ACCOUNT_NAME?.trim() || "Sales Next 測試";
const customerPrefix = "customers/";
const identityMapKey = "async-pipeline/config/customer-map.json";
const s3 = new S3Client({ region });

interface RawCrm extends Record<string, unknown> {
  company?: unknown;
  contact_name?: unknown;
  customer_type?: unknown;
  plan?: unknown;
  need?: unknown;
  budget?: unknown;
  stage?: unknown;
  timeline?: unknown;
  objection?: unknown;
  decision_maker?: unknown;
  next_action?: unknown;
  follow_up_date?: unknown;
  follow_up_raw?: unknown;
  quotes?: unknown;
}

interface CustomerLocation {
  customerKey: string;
  company: string;
  assigned: boolean;
  baseName: string;
}

export async function readLineRecords(limit = 100): Promise<LineRecordsResponse> {
  const objects = await listAll(customerPrefix);
  const crmObjects = objects
    .filter((object) => object.Key?.includes("/line/crm/") && object.Key.endsWith("_crm.json"))
    .sort((left, right) => +(right.LastModified ?? 0) - +(left.LastModified ?? 0))
    .slice(0, limit);

  const records = await mapWithConcurrency(crmObjects, 6, async (object) => {
    const key = object.Key;
    if (!key) return null;
    return readRecord(key, object.LastModified?.toISOString() ?? new Date().toISOString());
  });
  const validRecords = records.filter((record): record is LineIntegrationRecord => Boolean(record));
  const customerKeys = new Set(validRecords.map((record) => record.customerKey));
  const unassignedKeys = new Set(
    validRecords.filter((record) => !record.assigned).map((record) => record.customerKey)
  );

  return {
    status: {
      configured: true,
      connected: true,
      requiresAccessCode: false,
      accountName,
      customerCount: customerKeys.size,
      recordCount: validRecords.length,
      unassignedCount: unassignedKeys.size,
      lastMessageAt: validRecords[0]?.receivedAt ?? null,
    },
    records: validRecords,
  };
}

export async function readLineStatus(): Promise<LineIntegrationStatus> {
  const result = await readLineRecords(100);
  return result.status;
}

export async function assignLineCustomer(customerKey: string, requestedCompany: string) {
  if (!/^contact-[a-f0-9]{16}$/.test(customerKey)) {
    throw new Error("無效的匿名客戶編號");
  }
  const company = sanitizeCustomerFolderName(requestedCompany);
  if (company === "_unassigned") throw new Error("請輸入有效的公司名稱");

  const sourcePrefix = `${customerPrefix}_unassigned/${customerKey}/line/`;
  const objects = await listAll(sourcePrefix);
  if (!objects.length) throw new Error("找不到待辨識客戶資料");

  const rawObject = objects.find((object) => object.Key?.includes("/raw/") && object.Key.endsWith(".txt"));
  if (!rawObject?.Key) throw new Error("找不到 LINE 原始資料，無法建立身分對照");
  const raw = await readText(rawObject.Key);
  const subjectId = parseSubjectId(raw);
  if (!subjectId || anonymousCustomerKey(subjectId) !== customerKey) {
    throw new Error("匿名客戶驗證失敗");
  }

  const destinationPrefix = `${customerPrefix}${company}/line/`;
  for (const object of objects) {
    if (!object.Key) continue;
    const relative = object.Key.slice(sourcePrefix.length);
    await copyObject(object.Key, `${destinationPrefix}${relative}`);
  }

  const identityMap = await readJson(identityMapKey).catch(() => ({ version: 1, line: {} }));
  const currentLine = isRecord(identityMap.line) ? identityMap.line : {};
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: identityMapKey,
      Body: JSON.stringify({ ...identityMap, version: 1, line: { ...currentLine, [subjectId]: company } }, null, 2),
      ContentType: "application/json; charset=utf-8",
    })
  );

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects.flatMap((object) => (object.Key ? [{ Key: object.Key }] : [])) },
    })
  );

  return { customerKey, company, movedArtifacts: objects.length };
}

async function readRecord(crmKey: string, receivedAt: string): Promise<LineIntegrationRecord | null> {
  const location = parseCustomerLocation(crmKey);
  if (!location) return null;
  const transcriptKey = crmKey
    .replace("/line/crm/", "/line/transcripts/")
    .replace(/_crm\.json$/, "_transcript.txt");
  const [crm, transcript] = await Promise.all([
    readJson(crmKey) as Promise<RawCrm>,
    readText(transcriptKey).catch(() => ""),
  ]);

  return {
    id: stableId(crmKey),
    customerKey: location.customerKey,
    company: location.company,
    assigned: location.assigned,
    receivedAt,
    transcript: sanitizeTranscript(transcript),
    crm: sanitizeCrm(crm),
  };
}

function parseCustomerLocation(key: string): CustomerLocation | null {
  const marker = "/line/crm/";
  const markerIndex = key.indexOf(marker);
  if (!key.startsWith(customerPrefix) || markerIndex < 0) return null;
  const customerPath = key.slice(customerPrefix.length, markerIndex);
  const baseName = key.slice(markerIndex + marker.length).replace(/_crm\.json$/, "");
  if (customerPath.startsWith("_unassigned/")) {
    const customerKey = customerPath.split("/")[1];
    if (!customerKey) return null;
    return { customerKey, company: "待辨識客戶", assigned: false, baseName };
  }
  const company = customerPath;
  return {
    customerKey: `company-${stableId(company)}`,
    company,
    assigned: true,
    baseName,
  };
}

function sanitizeCrm(crm: RawCrm): LineCrmSnapshot {
  return {
    company: stringOrNull(crm.company),
    contactName: stringOrNull(crm.contact_name),
    customerType: stringOrNull(crm.customer_type),
    plan: stringOrNull(crm.plan),
    need: stringOrNull(crm.need),
    budget: budgetString(crm.budget),
    stage: stringOrNull(crm.stage),
    timeline: stringOrNull(crm.timeline),
    objection: stringOrNull(crm.objection),
    decisionMaker: decisionMakerString(crm.decision_maker),
    nextAction: stringOrNull(crm.next_action),
    followUpDate: stringOrNull(crm.follow_up_date) ?? stringOrNull(crm.follow_up_raw),
    quotes: quoteStrings(crm.quotes),
  };
}

function sanitizeTranscript(value: string): string {
  return value
    .replace(/U[a-f0-9]{32}/gi, "LINE 客戶")
    .replace(/^未知[：:]/gm, "LINE 客戶：")
    .trim()
    .slice(0, 20_000);
}

function parseSubjectId(raw: string): string | null {
  const match = raw.match(/<!-- pipeline-metadata\s*([\s\S]*?)\s*-->/);
  if (!match?.[1]) return null;
  try {
    const metadata = JSON.parse(match[1]) as { subject_id?: unknown };
    return typeof metadata.subject_id === "string" ? metadata.subject_id : null;
  } catch {
    return null;
  }
}

function anonymousCustomerKey(subjectId: string): string {
  return `contact-${createHash("sha256").update(`line:${subjectId}`, "utf8").digest("hex").slice(0, 16)}`;
}

function sanitizeCustomerFolderName(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);
  return cleaned || "_unassigned";
}

async function listAll(prefix: string): Promise<_Object[]> {
  const objects: _Object[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    objects.push(...(page.Contents ?? []));
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  return objects;
}

async function readText(key: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body?.transformToString("utf8") ?? "";
}

async function readJson(key: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readText(key)) as Record<string, unknown>;
}

async function copyObject(sourceKey: string, destinationKey: string) {
  const copySource = encodeURIComponent(`${bucket}/${sourceKey}`).replace(/%2F/g, "/");
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: destinationKey,
      MetadataDirective: "COPY",
    })
  );
}

function stableId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && !["null", "unknown", "未知", "不明", "n/a"].includes(normalized.toLowerCase())
    ? normalized.slice(0, 2_000)
    : null;
}

function budgetString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringOrNull(value);
}

function decisionMakerString(value: unknown): string | null {
  const direct = stringOrNull(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;
  const name = stringOrNull(value.name);
  const role = stringOrNull(value.role);
  const attended = typeof value.attended === "boolean" ? (value.attended ? "已到場" : "未到場") : null;
  const details = [name, role].filter(Boolean).join(" ");
  return [attended, details && `（${details}）`].filter(Boolean).join("") || null;
}

function quoteStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => (stringOrNull(item) ? [stringOrNull(item)!] : []));
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((item) => (stringOrNull(item) ? [stringOrNull(item)!] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await mapper(values[index]!);
      }
    })
  );
  return results;
}
