import type { AiProvider } from "@/lib/types";

export const DEFAULT_AI_PROVIDER: AiProvider = "bedrock";

export const AI_PROVIDER_OPTIONS: {
  value: AiProvider;
  label: string;
  description: string;
}[] = [
  {
    value: "bedrock",
    label: "AWS Bedrock",
    description: "正式環境預設；CRM 抽取、NBA 與知識庫問答走 Bedrock。",
  },
  {
    value: "openai",
    label: "OpenAI GPT",
    description: "本機測 pipeline 可快速切換；語音轉寫仍使用 OpenAI Whisper。",
  },
];

export function normalizeAiProvider(value: unknown): AiProvider {
  return value === "openai" ? "openai" : DEFAULT_AI_PROVIDER;
}

export function aiProviderLabel(provider: AiProvider): string {
  return provider === "openai" ? "OpenAI GPT" : "AWS Bedrock";
}
