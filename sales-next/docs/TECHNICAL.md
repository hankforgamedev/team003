# Sales Next Technical Notes

這份文件給要繼續開發的人看。它描述目前 repo 的實際架構，不是理想重構圖。

## Repo Shape

目前這個 GitHub repo 是兩層：

```text
repo root/
  package.json                  # @sales-next/knowledge-base package
  src/                          # knowledge-base core/react/provider source
  dist/                         # built knowledge-base package
  sales-next/
    package.json                # Next.js app
    app/
    components/
    lib/
    docs/
```

`sales-next/package.json` 透過 `"@sales-next/knowledge-base": "file:.."` 引用 repo root 的知識庫 package。

## Runtime Architecture

```text
Audio / transcript / Taoyuan JSON
  -> app/meetings/new/page.tsx
  -> lib/pipeline.ts normalize input
  -> app/api/transcribe       # Whisper only
  -> app/api/extract          # Bedrock/OpenAI JSON extraction
  -> lib/store.ts             # addDeal + addMeeting, persisted to localStorage
  -> lib/kb/store.ts          # sync meeting into knowledge base
  -> app/api/nba              # rules + optional LLM polish
  -> app/api/lead-discovery   # optional OpenAI web_search lead discovery
  -> pages                    # deal, meeting, KB, leads, funnel, analytics
```

There is no database. The browser is the workspace.

## Meeting Pipeline

The visible Taoyuan-Hsinchu pipeline order lives in `lib/pipeline.ts`:

1. 接收輸入
2. 建立逐字稿
3. 說話者整理
4. 抽取 CRM JSON
5. 驗證與正規化
6. 建立案件頁
7. 產生分析
8. 同步知識庫

`app/meetings/new/page.tsx` uses the same list for the progress UI. `Meeting.pipeline` stores a snapshot so the meeting detail page can show what happened for that meeting.

## Data Model

Main types are in `lib/types.ts`.

- `Deal`: CRM opportunity/account/contact combined for the demo.
- `Meeting`: transcript, summary, extraction, NBA, source, pipeline snapshot.
- `MeetingExtraction`: structured CRM fields produced from transcript/JSON.
- `NBAResult`: Next Best Action actions and reasoning.
- `AiProvider`: `"bedrock" | "openai"`.

When adding fields, update all of these together:

- `lib/types.ts`
- `app/api/extract/route.ts` JSON schema and prompt
- `lib/pipeline.ts` normalizer
- `app/meetings/new/page.tsx` field display and `Deal` mapping
- `lib/kb/adapter.ts` if the field should appear in knowledge-base docs

## Persistence

`lib/store.ts` uses zustand + `persist` + localStorage under `sales-next-store-v1`.

Important behavior:

- `seedIfNeeded()` loads deterministic demo data.
- Old seed versions or stale seed data are regenerated.
- User-created records are preserved when possible.
- `addMeeting()` also calls `syncMeetingToKb()` as a side effect.
- Reset functions rebuild both Sales Next state and KB state.

No server-side persistence exists. Do not add a DB without an explicit product decision.

## AI Providers

Text AI routing:

- `lib/ai/provider-config.ts`: available providers and default. Default is AWS Bedrock.
- `lib/ai/client.ts`: browser-side helper. It sends the selected provider to API routes and falls back on failure.
- `lib/ai/llm.ts`: server-side Bedrock/OpenAI router.
- `app/api/extract/route.ts`: CRM JSON extraction.
- `app/api/nba/route.ts`: optional LLM polish for NBA.
- `app/api/kb-ask/route.ts`: knowledge-base answer generation.
- `app/api/lead-discovery/route.ts`: public-web potential customer discovery ported from the Streamlit app.
- `app/api/health/route.ts`: current provider readiness.

Speech-to-text:

- `app/api/transcribe/route.ts` always uses OpenAI Whisper through `lib/ai/openai.ts`.
- Bedrock is not used for transcription.

Fallback rules:

- Extract API failure -> `lib/ai/demo-engine.ts` heuristic extraction.
- NBA API failure -> `lib/ai/nba-rules.ts`.
- KB LLM failure -> root package `ask()` falls back to extractive answer with citations.
- Audio transcription has no offline fallback; UI tells user to paste transcript or use demo meeting.
- Lead Discovery requires OpenAI Responses `web_search`. It does not use Bedrock fallback because Bedrock has no equivalent public-web search tool in this app.

## Lead Discovery

The Streamlit project at `/Users/shawnlee/003/ai-sales-assistant-main` contributed the AI Potential Customer Discovery flow. In this Next app it lives at:

- `app/leads/page.tsx`: browser UI, selected company, target market, max leads, local run history.
- `app/api/lead-discovery/route.ts`: server route that builds a knowledge profile, creates three bounded search queries, runs OpenAI `web_search`, deduplicates, scores, and returns strict JSON.
- `lib/lead/types.ts`: shared TypeScript types and JSON schemas.

Clicking search on `/leads` calls the live web-search route. The old Streamlit SQLite/S3 persistence was intentionally not copied because this app has no server database or cloud persistence layer.

Bedrock SDK note:

`lib/ai/llm.ts` must lazy-load `@anthropic-ai/bedrock-sdk` with runtime import. Static import can break `next build` because the SDK pulls exports that Webpack resolves too early.

Knowledge-base note:

The root `@sales-next/knowledge-base` package currently types `LlmProvider.name` as `"bedrock"`. App-side `lib/kb/provider.ts` keeps `name: "bedrock"` for type compatibility; actual OpenAI/Bedrock selection is sent in `/api/kb-ask` request body.

## Environment Variables

```env
# Bedrock, default text provider
BEDROCK_AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL=anthropic.claude-opus-5

# OpenAI provider and Whisper
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

`.env.local` is ignored and must stay out of git.

## Knowledge Base

The app wraps the root package in:

- `lib/kb/store.ts`: localStorage store singleton and Sales Next meeting seed/sync.
- `lib/kb/adapter.ts`: converts meetings into knowledge docs.
- `lib/kb/provider.ts`: browser `LlmProvider` that calls `/api/kb-ask`.
- `app/knowledge/page.tsx`: renders `<KnowledgeBase />`.

If new meeting fields should be searchable, add them to `lib/kb/adapter.ts`.

## Analytics

All analytics derive from `Deal[]` and `Meeting[]`.

Primary file: `lib/data/analytics.ts`.

Do not hard-code dashboard numbers. If a chart needs a new metric, add a pure function in analytics and call it from the page/component.

## UI System

- Tailwind v4 tokens live in `app/globals.css`.
- Use existing tokens like `bg-surface`, `text-ink`, `border-line`, `text-primary`.
- Use `lucide-react` icons.
- Charts are hand-written SVG in `components/charts.tsx`.
- This is a work app, not a marketing site. Keep UI dense, scannable, and functional.

## Local Verification

```bash
cd sales-next
npm run build
npm run dev -- --port 3001
```

Browser smoke:

1. Open `/`.
2. Switch to 主管視角.
3. Open `/meetings/new`.
4. Run 載入示範會議.
5. Confirm `已存檔`.
6. Open `/knowledge` and confirm the meeting appears.
7. Open `/analytics` and confirm counts changed.

## Common Troubleshooting

- Page renders unstyled after build: restart `next dev`.
- Health says Bedrock not configured: set `BEDROCK_AWS_REGION` or switch Settings to OpenAI.
- OpenAI mode not live: set `OPENAI_API_KEY`.
- Audio upload fails while text pipeline works: Whisper key is missing or audio format failed.
- KB answers are extractive: provider failed; this is expected fallback, not a hard failure.
- `git status` shows `.next` artifacts: they should be ignored. Do not commit build output.
