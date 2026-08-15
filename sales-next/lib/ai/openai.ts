// OpenAI 呼叫層（server-side only）。
// Provider 分流在 llm.ts；這裡只保留 OpenAI GPT 與 Whisper 的實作。

const API = "https://api.openai.com/v1";

export function hasKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };
}

// 2026-08 現行系列：gpt-5.6-terra（中階，品質/成本平衡）；備援鏈涵蓋舊命名以防環境差異
const PRIMARY_MODEL = () => process.env.OPENAI_MODEL || "gpt-5.6-terra";
const MODEL_CHAIN = () => [PRIMARY_MODEL(), "gpt-5.6-luna", "gpt-5-mini", "gpt-4o-mini"];

export async function chatJSON(system: string, user: string, schemaName: string, schema: object): Promise<unknown> {
  const body = (model: string) => ({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, schema, strict: false },
    },
  });

  for (const model of MODEL_CHAIN()) {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body(model)),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      try {
        return JSON.parse(content);
      } catch {
        throw new Error("模型回傳非 JSON");
      }
    }
    // 模型不存在或無權限 → 換備用模型；其他錯誤直接丟出
    if (res.status !== 404 && res.status !== 400 && res.status !== 403) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }
  }
  throw new Error("OpenAI 呼叫失敗（primary 與 fallback 模型皆不可用）");
}

export async function chatText(system: string, user: string): Promise<string> {
  for (const model of MODEL_CHAIN()) {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }
    if (res.status !== 404 && res.status !== 400 && res.status !== 403) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }
  }
  throw new Error("OpenAI 呼叫失敗");
}

export async function transcribe(file: File): Promise<{ segments: { t: number; text: string }[]; text: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("language", "zh");
  const res = await fetch(`${API}/audio/transcriptions`, {
    method: "POST",
    headers: headers(),
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const segments = (data.segments ?? []).map((s: { start: number; text: string }) => ({
    t: Math.round(s.start),
    text: String(s.text).trim(),
  }));
  return { segments, text: data.text ?? "" };
}
