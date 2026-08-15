import type { Citation } from "@sales-next/knowledge-base";
import {
  BEDROCK_CLAUDE_MODEL,
  createBedrockProvider,
} from "@sales-next/knowledge-base/providers/bedrock";
import type { AiProvider } from "@/lib/types";
import { aiProviderLabel, normalizeAiProvider } from "@/lib/ai/provider-config";
import {
  chatJSON as openAiChatJSON,
  chatText as openAiChatText,
  hasKey as hasOpenAiKey,
} from "@/lib/ai/openai";

interface MantleClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      stop_reason?: string | null;
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

let bedrockClient: { region: string; promise: Promise<MantleClient> } | null = null;

async function loadRuntimeModule(specifier: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ specifier);
}

export function getAiProviderFromRequest(value: unknown): AiProvider {
  return normalizeAiProvider(value);
}

export function getBedrockRegion(): string {
  return (
    process.env.BEDROCK_AWS_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    ""
  ).trim();
}

export function getBedrockModel(): string {
  return (process.env.BEDROCK_MODEL || BEDROCK_CLAUDE_MODEL).trim();
}

function getBedrockEffort(): "low" | "medium" | "high" {
  const value = process.env.BEDROCK_EFFORT;
  return value === "medium" || value === "high" ? value : "low";
}

function getMaxTokens(): number {
  const parsed = Number(process.env.BEDROCK_MAX_TOKENS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4096;
}

export function getAiProviderHealth(provider: AiProvider): {
  provider: AiProvider;
  label: string;
  live: boolean;
  model: string;
  reason: string;
} {
  if (provider === "openai") {
    return {
      provider,
      label: aiProviderLabel(provider),
      live: hasOpenAiKey(),
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      reason: hasOpenAiKey() ? "OPENAI_API_KEY 已設定" : "OPENAI_API_KEY 未設定",
    };
  }

  const region = getBedrockRegion();
  return {
    provider,
    label: aiProviderLabel(provider),
    live: Boolean(region),
    model: getBedrockModel(),
    reason: region
      ? `Bedrock region：${region}（AWS 憑證由 SDK default chain 讀取）`
      : "BEDROCK_AWS_REGION / AWS_REGION 未設定",
  };
}

function assertProviderReady(provider: AiProvider): void {
  const health = getAiProviderHealth(provider);
  if (!health.live) throw new Error(health.reason);
}

async function getBedrockClient(region: string): Promise<MantleClient> {
  if (!bedrockClient || bedrockClient.region !== region) {
    bedrockClient = {
      region,
      promise: (async () => {
        const mod = (await loadRuntimeModule("@anthropic-ai/bedrock-sdk")) as {
          AnthropicBedrockMantle: new (opts: { awsRegion: string }) => MantleClient;
        };
        return new mod.AnthropicBedrockMantle({ awsRegion: region });
      })(),
    };
  }
  return bedrockClient.promise;
}

async function bedrockChatText(system: string, user: string): Promise<string> {
  const region = getBedrockRegion();
  if (!region) throw new Error("BEDROCK_AWS_REGION / AWS_REGION 未設定");

  const client = await getBedrockClient(region);
  const response = await client.messages.create({
    model: getBedrockModel(),
    max_tokens: getMaxTokens(),
    system,
    output_config: { effort: getBedrockEffort() },
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("模型拒絕回答這個問題");
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("模型沒有回傳內容");
  return text;
}

function parseJsonObject(text: string): unknown {
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced);

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next normalized candidate.
    }
  }

  throw new Error(`模型回傳非 JSON：${text.slice(0, 120)}`);
}

export async function chatTextWithProvider(
  provider: AiProvider,
  system: string,
  user: string,
): Promise<string> {
  assertProviderReady(provider);
  if (provider === "openai") return openAiChatText(system, user);
  return bedrockChatText(system, user);
}

export async function chatJSONWithProvider(
  provider: AiProvider,
  system: string,
  user: string,
  schemaName: string,
  schema: object,
): Promise<unknown> {
  assertProviderReady(provider);
  if (provider === "openai") return openAiChatJSON(system, user, schemaName, schema);

  const jsonSystem = [
    system,
    "",
    "你必須只輸出一個合法 JSON object，不要 Markdown，不要註解，不要多餘文字。",
    `JSON schema name：${schemaName}`,
  ].join("\n");
  const jsonUser = [
    user,
    "",
    "請依照以下 JSON Schema 回傳：",
    JSON.stringify(schema),
  ].join("\n");

  return parseJsonObject(await bedrockChatText(jsonSystem, jsonUser));
}

export async function completeKnowledgeAnswer(
  provider: AiProvider,
  question: string,
  context: Citation[],
  openAiSystem: string,
): Promise<string> {
  assertProviderReady(provider);
  if (provider === "openai") {
    const { buildPrompt } = await import("@sales-next/knowledge-base");
    return openAiChatText(openAiSystem, buildPrompt(question, context));
  }

  const bedrock = createBedrockProvider({
    region: getBedrockRegion(),
    model: getBedrockModel(),
    effort: getBedrockEffort(),
    maxTokens: getMaxTokens(),
  });
  return bedrock.complete({ question, context });
}
