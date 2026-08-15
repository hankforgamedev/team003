"use client";

// Wow Moment 核心頁：開完會 → 逐字稿 → AI 抽取 → 自動建 CRM → Next Best Action
// 四種輸入：示範會議（離線保險路徑）／即時錄音／上傳音檔／貼上逐字稿
// 任何 AI 呼叫失敗都自動落到內建引擎，台上零風險。

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardPaste,
  FileAudio,
  Loader2,
  Mic,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { useSales } from "@/lib/store";
import {
  DEMO_DEAL_BASE,
  DEMO_MEETING_EXTRACTION,
  DEMO_MEETING_LINES,
  DEMO_MEETING_META,
} from "@/lib/data/showcase";
import { aiExtract, aiNba, aiTranscribe } from "@/lib/ai/client";
import { Deal, Meeting, MeetingExtraction, NBAResult, TranscriptSegment } from "@/lib/types";
import { Card, Chip, StageBadge } from "@/components/ui";
import { dealForecast, dealProbability } from "@/lib/crm";
import { aiProviderLabel } from "@/lib/ai/provider-config";
import {
  PIPELINE_STEPS,
  PipelinePhase,
  extractionSummary,
  normalizeExtraction,
  parseBudgetAmount,
  parseTranscriptSegments,
  pipelineSnapshots,
  resolveFollowUpIso,
  tryParsePipelineInput,
} from "@/lib/pipeline";
import { STAGE_LABEL } from "@/lib/types";

type Mode = "pick" | "record" | "paste" | "processing" | "done";
type Phase = PipelinePhase;
type MeetingEnvelope = {
  meetingId: string;
  meetingDate: string;
  company: string;
  contactName: string;
};

const FIELD_LABELS: [keyof MeetingExtraction, string][] = [
  ["company", "客戶名稱"],
  ["contact", "聯絡窗口"],
  ["role", "職稱"],
  ["customerType", "客戶類型"],
  ["plan", "銷售方案"],
  ["need", "客戶需求"],
  ["budget", "預算"],
  ["stage", "銷售階段"],
  ["timeline", "時程"],
  ["decisionMaker", "決策者"],
  ["contactDepartment", "窗口部門"],
  ["contactRole", "窗口角色"],
  ["painPoints", "痛點"],
  ["competitorMentioned", "提及競品"],
  ["decisionCriteria", "決策標準"],
  ["sentimentTone", "會議氛圍"],
  ["urgencyLevel", "急迫程度"],
  ["riskFlags", "風險警示"],
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function generateMeetingId(now = new Date()): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `MTG-${date}-${time}`;
}

function dateInputToDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function cleanFallback(value?: string): string {
  const text = value?.trim() ?? "";
  if (!text || /待補|未識別|未知/.test(text)) return "";
  return text;
}

export default function NewMeetingPage() {
  const router = useRouter();
  const { deals, addDeal, addMeeting, aiProvider, aiLive } = useSales();
  const providerLabel = aiProviderLabel(aiProvider);

  const [draftMeetingId] = useState(() => generateMeetingId());
  const [meetingDate, setMeetingDate] = useState(() => todayInputValue());
  const [companyInput, setCompanyInput] = useState("");
  const [contactNameInput, setContactNameInput] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [phase, setPhase] = useState<Phase>("input");
  const [lines, setLines] = useState<TranscriptSegment[]>([]);
  const [visibleFields, setVisibleFields] = useState(0);
  const [extraction, setExtraction] = useState<MeetingExtraction | null>(null);
  const [nba, setNba] = useState<NBAResult | null>(null);
  const [meetingId, setMeetingId] = useState("");
  const [dealId, setDealId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [error, setError] = useState("");
  const [usedLive, setUsedLive] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptBoxRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [lines]);

  // ===== 共用 pipeline：逐字稿 → 抽取 → CRM → NBA =====
  async function runPipeline(
    segments: TranscriptSegment[],
    opts: {
      title: string;
      source: Meeting["source"];
      envelope: MeetingEnvelope;
      preferCanned?: boolean;
      presetExtraction?: MeetingExtraction;
    }
  ) {
    setMode("processing");
    setPhase("input");
    setLines([]);
    setVisibleFields(0);
    setExtraction(null);
    setNba(null);
    await new Promise((r) => setTimeout(r, 320));
    setPhase("transcribing");

    // 逐句浮現（demo 節奏；真轉寫結果也用同樣的呈現）
    const stepMs = Math.min(420, Math.max(120, 9000 / segments.length));
    for (let i = 0; i < segments.length; i++) {
      await new Promise((r) => setTimeout(r, stepMs));
      setLines(segments.slice(0, i + 1));
    }

    setPhase("diarization");
    await new Promise((r) => setTimeout(r, 520));

    // AI 抽取
    setPhase("extracting");
    const fullText = segments.map((s) => `${s.speaker}：${s.text}`).join("\n");
    let ext: MeetingExtraction;
    let live = false;
    if (opts.presetExtraction) {
      ext = normalizeExtraction(opts.presetExtraction, fullText);
    } else if (opts.preferCanned && !aiLive) {
      ext = normalizeExtraction({ ...DEMO_MEETING_EXTRACTION }, fullText);
    } else {
      const r = await aiExtract(fullText, aiProvider);
      live = r.live;
      // 示範會議如果真 AI 抽得不完整，用手工版補洞（雙保險）
      ext = opts.preferCanned
        ? normalizeExtraction({ ...DEMO_MEETING_EXTRACTION, ...Object.fromEntries(Object.entries(r.extraction).filter(([, v]) => v && (!Array.isArray(v) || v.length))) as Partial<MeetingExtraction> }, fullText)
        : r.extraction;
    }
    setUsedLive(live);
    setPhase("validating");
    ext = normalizeExtraction(
      {
        ...ext,
        company: opts.envelope.company,
        contact: opts.envelope.contactName,
      },
      fullText
    );
    setExtraction(ext);
    for (let i = 0; i <= FIELD_LABELS.length; i++) {
      await new Promise((r) => setTimeout(r, 170));
      setVisibleFields(i);
    }

    // 建立 CRM 案件
    setPhase("crm");
    await new Promise((r) => setTimeout(r, 900));
    const now = new Date();
    const meetingDateObj = dateInputToDate(opts.envelope.meetingDate);
    const meetingDateIso = meetingDateObj.toISOString();
    const mId = opts.envelope.meetingId;
    const dId = `deal-${mId}`;
    const budgetNum = parseBudgetAmount(ext.budget);
    const company = opts.envelope.company;
    const nextFollowUp = resolveFollowUpIso(ext.followUpDate, meetingDateObj) ?? new Date(meetingDateObj.getTime() + 3 * 86400000).toISOString();
    const deal: Deal = {
      id: dId,
      company,
      contact: ext.contact,
      role: ext.role,
      customerType: (ext.customerType || "企業客戶") as Deal["customerType"],
      plan: (ext.plan || "企業方案") as Deal["plan"],
      budget: budgetNum,
      need: ext.need,
      timeline: ext.timeline,
      objections: ext.objections,
      decisionMakerMet: !ext.decisionMaker.includes("未"),
      stage: ext.stage === "lead" ? "lead" : ext.stage,
      stageHistory: [
        { stage: "lead", date: meetingDateIso },
        ...(ext.stage !== "lead" ? [{ stage: ext.stage, date: meetingDateIso }] : []),
      ],
      meetingIds: [mId],
      owner: "張予安",
      createdAt: now.toISOString(),
      nextFollowUp,
      dealName: `${company}｜${ext.plan || "企業方案"}｜${STAGE_LABEL[ext.stage]}`,
      dealType: ext.dealType === "既有客戶增購" ? "既有客戶增購" : "新客開發",
      leadSource: ["主動開發", "客戶轉介", "官網詢問", "活動名單", "合作夥伴"].includes(ext.leadSource ?? "")
        ? (ext.leadSource as Deal["leadSource"])
        : "主動開發",
      probability: ext.probability,
      forecastCategory: ext.forecastCategory,
      expectedCloseDate: ext.expectedCloseDate,
      nextStep: ext.nextActions[0],
      lastActivityAt: meetingDateIso,
      nextActivity: "追蹤會議",
      priority: ext.priority ?? (budgetNum >= 1_000_000 ? "high" : budgetNum >= 500_000 ? "medium" : "low"),
      industry: ext.industry,
      employeeRange: ext.employeeRange,
      contactEmail: ext.contactEmail,
      contactPhone: ext.contactPhone,
      preferredChannel: ["Email", "LINE", "電話", "會議"].includes(ext.preferredChannel ?? "")
        ? (ext.preferredChannel as Deal["preferredChannel"])
        : "會議",
      products: [ext.plan || "企業方案"],
      painPoints: ext.painPoints,
      successMetrics: ext.successMetrics,
      decisionCriteria: ext.decisionCriteria,
      competitors: ext.competitors,
      procurementProcess: ext.procurementProcess,
      tags: [ext.customerType || "企業客戶", ext.plan || "企業方案", "桃園新竹 Pipeline"],
      recordSource: "AI 會議抽取",
      companySize: ext.companySize,
      annualRevenueRange: ext.annualRevenueRange,
      currentToolsInUse: ext.currentToolsInUse,
      contactDepartment: ext.contactDepartment,
      contactRole: ext.contactRole,
      additionalStakeholders: ext.additionalStakeholders,
      proposedSolution: ext.proposedSolution,
      budgetConfirmed: ext.budgetConfirmed,
      decisionMakerName: ext.decisionMaker,
      competitorMentioned: ext.competitorMentioned,
      urgencyLevel: ext.urgencyLevel,
      sentimentTone: ext.sentimentTone,
      riskFlags: ext.riskFlags,
      keyQuotes: ext.keyQuotes,
      meetingSummary: ext.meetingSummary,
    };
    deal.probability ??= dealProbability(deal);
    deal.forecastCategory ??= dealForecast(deal);

    // NBA
    setPhase("analysis");
    const nbaResult = await aiNba(ext, deals, opts.title, aiProvider);
    setNba(nbaResult);

    setPhase("knowledge");
    const meetingTitle =
      opts.title.includes("貼上逐字稿") || opts.title.includes("Pipeline 匯入")
        ? `${company}｜${STAGE_LABEL[ext.stage]}會議`
        : opts.title;
    const meeting: Meeting = {
      id: mId,
      dealId: dId,
      title: meetingTitle,
      date: meetingDateIso,
      durationMin: opts.preferCanned ? DEMO_MEETING_META.durationMin : Math.max(1, Math.round(segments.length / 3)),
      attendees: opts.preferCanned ? DEMO_MEETING_META.attendees : ["我方業務", "客戶"],
      transcript: segments,
      summary: extractionSummary(ext),
      extraction: ext,
      nba: nbaResult,
      source: opts.source,
      consent: true,
      pipeline: pipelineSnapshots("done"),
    };
    addDeal(deal);
    addMeeting(meeting);
    await new Promise((r) => setTimeout(r, 360));
    setMeetingId(mId);
    setDealId(dId);
    setPhase("done");
    setMode("done");
  }

  // ===== 各輸入模式 =====
  const startDemo = () => {
    const envelope = buildEnvelope({ extraction: DEMO_MEETING_EXTRACTION });
    if (!envelope) return;
    const segs: TranscriptSegment[] = [];
    let t = 0;
    for (const [speaker, text] of DEMO_MEETING_LINES) {
      segs.push({ t, speaker, text });
      t += 8 + Math.round(text.length / 3);
    }
    runPipeline(segs, { title: DEMO_MEETING_META.title, source: "demo", envelope, preferCanned: true });
  };

  const startRecord = async () => {
    setError("");
    const envelope = buildEnvelope();
    if (!envelope) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setRecSecs(0);
      const timer = setInterval(() => setRecSecs((s) => s + 1), 1000);
      rec.onstop = async () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        // iOS Safari 的 MediaRecorder 產出 audio/mp4，不能寫死 webm
        const mime = rec.mimeType || "audio/mp4";
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `recording.${ext}`, { type: mime });
        await handleAudio(file, envelope);
      };
      setMode("record");
    } catch {
      setError("無法存取麥克風。可以改用「載入示範會議」或貼上逐字稿。");
    }
  };

  const stopRecord = () => mediaRef.current?.stop();

  const handleAudio = async (file: File, providedEnvelope?: MeetingEnvelope) => {
    const envelope = providedEnvelope ?? buildEnvelope();
    if (!envelope) return;
    setMode("processing");
    setPhase("transcribing");
    setLines([]);
    const r = await aiTranscribe(file);
    if (!r) {
      setMode("pick");
      setError(
        aiLive
          ? "轉寫失敗，請再試一次，或改用示範會議／貼上逐字稿。"
          : "音檔轉寫需要 OPENAI_API_KEY；如果只測 pipeline，請改用「貼上逐字稿」或「載入示範會議」。"
      );
      return;
    }
    await runPipeline(r.segments, {
      title: `${envelope.company}｜錄音會議`,
      source: file.name.startsWith("recording.") ? "recorded" : "uploaded",
      envelope,
    });
  };

  const startPaste = () => {
    if (!pasteText.trim()) return;
    const imported = tryParsePipelineInput(pasteText);
    if (imported) {
      const envelope = buildEnvelope({ extraction: imported.extraction });
      if (!envelope) return;
      runPipeline(imported.segments, {
        title: imported.title,
        source: "pasted",
        envelope,
        presetExtraction: imported.extraction,
      });
      return;
    }
    const envelope = buildEnvelope();
    if (!envelope) return;
    const segs = parseTranscriptSegments(pasteText);
    runPipeline(segs, { title: `${envelope.company}｜貼上逐字稿`, source: "pasted", envelope });
  };

  function buildEnvelope(fallback?: { extraction?: MeetingExtraction }): MeetingEnvelope | null {
    const fallbackCompany = cleanFallback(fallback?.extraction?.company);
    const fallbackContact = cleanFallback(fallback?.extraction?.contact);
    const company = companyInput.trim() || fallbackCompany;
    const contactName = contactNameInput.trim() || fallbackContact;

    if (!meetingDate || !company || !contactName) {
      setError("請先填會議日期、公司名稱和聯絡窗口，再開始分析。");
      return null;
    }

    setError("");
    return {
      meetingId: draftMeetingId,
      meetingDate,
      company,
      contactName,
    };
  }

  // ===== UI =====
  if (mode === "pick" || mode === "record" || mode === "paste") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-black">開始新會議</h1>
        <p className="mt-1 text-sm text-muted">選一種方式，開完會 AI 直接告訴你下一步。</p>

        <div className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 text-sm font-bold">會議基本資料</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
              meeting_id
              <input
                value={draftMeetingId}
                readOnly
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold text-muted outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
              meeting_date
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
              company
              <input
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                placeholder="沐日食品"
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
              contact_name
              <input
                value={contactNameInput}
                onChange={(e) => setContactNameInput(e.target.value)}
                placeholder="張怡君"
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">
            ID 由系統自動產生；存檔時會用這三個欄位覆蓋 AI 抽取結果，避免客戶名稱或窗口被模型猜錯。
          </p>
        </div>

        {/* 錄音同意（個資法：告知義務內建於產品） */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-primary-soft/50 px-4 py-3 text-xs leading-relaxed text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <b>錄音前請完成告知：</b>「為了會後整理與服務品質，這場會議將會錄音，會議資料僅供貴我雙方專案使用。」
            繼續操作即代表已取得與會者同意。資料如何被處理，見「設定 → 資料與隱私」。
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
          <div className="mb-2 text-xs font-bold text-ink-2">桃園新竹 Pipeline 順序</div>
          <div className="grid gap-2 sm:grid-cols-4">
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.key} className="rounded-lg bg-bg px-3 py-2">
                <div className="num text-[10px] font-bold text-primary">{String(index + 1).padStart(2, "0")}</div>
                <div className="mt-0.5 text-xs font-bold">{step.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">{step.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={startDemo}
            className="card group flex flex-col items-start gap-2 p-5 text-left transition hover:border-primary/50 hover:shadow-pop"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <PlayCircle size={20} />
            </span>
            <span className="font-bold">載入示範會議</span>
            <span className="text-xs leading-relaxed text-muted">
              重播「ABC 品牌」年約洽談實況，完整體驗 錄音→CRM→AI 建議 流程（離線可用）
            </span>
            <span className="mt-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
              建議從這裡開始
            </span>
          </button>

          {mode === "record" || recording ? (
            <div className="card flex flex-col items-center justify-center gap-3 p-5">
              <span className="pulse-dot flex h-12 w-12 items-center justify-center rounded-full bg-bad text-white">
                <Mic size={22} />
              </span>
              <span className="num text-2xl font-bold">
                {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
              </span>
              <button
                onClick={stopRecord}
                className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white"
              >
                <Square size={13} /> 結束並分析
              </button>
            </div>
          ) : (
            <button
              onClick={startRecord}
              className="card group flex flex-col items-start gap-2 p-5 text-left transition hover:border-primary/50 hover:shadow-pop"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bad-soft text-bad">
                <Mic size={20} />
              </span>
              <span className="font-bold">即時錄音</span>
              <span className="text-xs leading-relaxed text-muted">
                用麥克風錄下會議，轉寫使用 OpenAI Whisper，後續分析走 {providerLabel}
              </span>
            </button>
          )}

          <label className="card group flex cursor-pointer flex-col items-start gap-2 p-5 text-left transition hover:border-primary/50 hover:shadow-pop">
            <input
              type="file"
              accept="audio/*,video/webm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleAudio(e.target.files[0])}
            />
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-soft text-warn">
              <FileAudio size={20} />
            </span>
            <span className="font-bold">上傳音檔</span>
            <span className="text-xs leading-relaxed text-muted">
              支援 mp3 / m4a / wav / webm，轉寫使用 OpenAI Whisper，後續分析走 {providerLabel}
            </span>
          </label>

          <div className="card flex flex-col gap-2 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-good-soft text-good">
              <ClipboardPaste size={20} />
            </span>
            <span className="font-bold">貼上逐字稿</span>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"每行一句，格式：\n張經理：我們的預算大概 120 萬…\n\n也可直接貼桃園新竹 CRM JSON"}
              className="h-20 w-full resize-none rounded-lg border border-line bg-bg p-2.5 text-xs outline-none focus:border-primary"
            />
            <button
              onClick={startPaste}
              disabled={!pasteText.trim()}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              分析逐字稿
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 處理中／完成 畫面 =====
  const phases: { key: Phase; label: string }[] = PIPELINE_STEPS.map((step) => ({
    key: step.key as Phase,
    label: step.label,
  }));
  const phaseIdx = phases.findIndex((p) => p.key === phase);

  return (
    <div className="mx-auto max-w-4xl">
      {/* 進度列 */}
      <div className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium">
        {phases.map((p, i) => {
          const done = phase === "done" || i < phaseIdx;
          const cur = i === phaseIdx && phase !== "done";
          return (
            <div key={p.key} className="flex shrink-0 items-center gap-1.5">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                  done ? "bg-good-soft text-good" : cur ? "bg-primary text-white" : "bg-[#eef1f8] text-muted"
                }`}
              >
                {done ? <CheckCircle2 size={13} /> : cur ? <Loader2 size={13} className="animate-spin" /> : null}
                {p.label}
              </span>
              {i < phases.length - 1 && <span className="h-px w-4 bg-line" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 逐字稿 */}
        <Card className="flex h-[430px] flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">逐字稿</span>
            <Chip tone="blue">{usedLive ? `${providerLabel} 即時分析` : "內建示範引擎"}</Chip>
          </div>
          <div ref={transcriptBoxRef} className="scroll-slim flex-1 space-y-2.5 overflow-y-auto pr-1">
            {lines.map((s, i) => (
              <div key={i} className="typein flex gap-2 text-[13px] leading-relaxed">
                <span className="num shrink-0 pt-0.5 text-[10px] text-muted">
                  {String(Math.floor(s.t / 60)).padStart(2, "0")}:{String(s.t % 60).padStart(2, "0")}
                </span>
                <span>
                  <b className={s.speaker.includes("張") || s.speaker === "我方業務" ? "text-primary" : "text-ink"}>
                    {s.speaker}
                  </b>
                  ：{s.text}
                </span>
              </div>
            ))}
            {phase === "transcribing" && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> 轉寫中…
              </div>
            )}
          </div>
        </Card>

        {/* 抽取結果＋NBA */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-sm font-bold">CRM 案件（AI 自動建檔）</span>
              {phase === "done" && extraction && <StageBadge stage={extraction.stage} />}
            </div>
            {extraction ? (
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                {FIELD_LABELS.slice(0, visibleFields).map(([key, label]) => {
                  const v = extraction[key];
                  const text = Array.isArray(v) ? v.join("、") : key === "stage" ? undefined : String(v || "—");
                  return (
                    <div key={key} className="typein flex items-baseline gap-2">
                      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
                      {key === "stage" ? (
                        <StageBadge stage={extraction.stage} />
                      ) : key === "customerType" && text !== "—" ? (
                        <Chip tone="blue">{text}</Chip>
                      ) : key === "plan" && text !== "—" ? (
                        <Chip tone="purple">{text}</Chip>
                      ) : (
                        <span className="font-medium">{text}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-6 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> 等待逐字稿完成…
              </div>
            )}
          </Card>

          <Card className="border-primary/25 bg-primary-soft/35">
            <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">
              <Sparkles size={15} className="text-primary" /> Next Best Action
              {nba && <Chip tone="blue">{nba.aiMode === "rules+llm" ? "顧問規則＋LLM" : "顧問規則引擎"}</Chip>}
            </div>
            {nba ? (
              <ol className="space-y-2.5">
                {nba.actions.map((a, i) => (
                  <li key={i} className="typein flex gap-2.5" style={{ animationDelay: `${i * 0.15}s` }}>
                    <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 text-[13px]">
                      <div className="font-semibold">
                        {a.title}
                        <span className="num ml-1.5 text-[11px] font-medium text-warn">{a.dueInDays} 天內</span>
                      </div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted">{a.why}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex items-center gap-2 py-4 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" />
                {phaseIdx >= 3 ? "根據歷史案件計算建議…" : "等待 CRM 建檔…"}
              </div>
            )}
            {phase === "done" && (
              <div className="mt-4">
                <div className="mb-3 rounded-xl border border-good/20 bg-good-soft px-3.5 py-3 text-xs leading-relaxed text-good">
                  <b>已存檔。</b>會議 ID：<span className="num font-bold">{meetingId}</span>
                  <br />
                  已寫入「會議紀錄」、建立「CRM 案件」，並同步到知識庫；瀏覽器重新整理後也會保留在本機工作區。
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/deals/${dealId}`}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
                  >
                    查看 CRM 案件
                  </Link>
                  <Link
                    href={`/meetings/${meetingId}`}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 transition hover:border-primary/40"
                  >
                    查看會議紀錄
                  </Link>
                  <Link
                    href="/meetings"
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 transition hover:border-primary/40"
                  >
                    全部會議
                  </Link>
                  <button
                    onClick={() => router.push("/")}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 transition hover:border-primary/40"
                  >
                    回總覽
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
