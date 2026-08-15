"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Mic,
  FolderKanban,
  BookOpenText,
  Filter,
  BarChart3,
  Settings,
  Sparkles,
  UserRound,
  Briefcase,
} from "lucide-react";
import { useSales } from "@/lib/store";
import { checkAiLive } from "@/lib/ai/client";
import { aiProviderLabel } from "@/lib/ai/provider-config";
import { WorkspaceAnalysisStrip } from "@/components/PipelineAnalysis";

const NAV = [
  { href: "/", label: "總覽", icon: LayoutDashboard },
  { href: "/meetings", label: "會議紀錄", icon: Mic },
  { href: "/deals", label: "案件管理", icon: FolderKanban },
  { href: "/knowledge", label: "知識庫", icon: BookOpenText },
  { href: "/funnel", label: "銷售漏斗", icon: Filter },
  { href: "/analytics", label: "分析報表", icon: BarChart3 },
  { href: "/settings", label: "設定", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { seedIfNeeded, hydrated, view, setView, aiProvider, aiLive, setAiLive } = useSales();
  const providerLabel = aiProviderLabel(aiProvider);

  useEffect(() => {
    seedIfNeeded();
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "development") {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())))
          .catch(() => {});
        if ("caches" in window) {
          caches
            .keys()
            .then((keys) =>
              Promise.all(keys.filter((k) => k.startsWith("sales-next")).map((k) => caches.delete(k)))
            )
            .catch(() => {});
        }
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
  }, [seedIfNeeded]);

  useEffect(() => {
    let cancelled = false;
    const requestedProvider = aiProvider;

    setAiLive(null);
    checkAiLive(requestedProvider).then((live) => {
      if (!cancelled) {
        setAiLive(live);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [aiProvider, setAiLive]);

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh">
      {/* 桌面側欄 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r border-white/10 bg-navy-1 px-4 py-5 md:flex">
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <Sparkles size={18} />
          </span>
          <span className="text-lg font-black tracking-[0.04em] text-white">Sales Next</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${active(href) ? "active" : ""}`}>
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-white/85">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                aiLive ? "bg-emerald-400" : "bg-amber-400"
              } pulse-dot`}
            />
            {aiLive === null ? "AI 檢查中…" : aiLive ? `${providerLabel} 已連線` : "Demo 模式"}
          </div>
          {aiLive === null
            ? `正在確認 ${providerLabel} 連線狀態`
            : aiLive
              ? `文字分析目前走 ${providerLabel}`
              : `未偵測到 ${providerLabel} 設定，以內建示範引擎運作（完整功能可用）`}
        </div>
      </aside>

      {/* 主內容 */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-[228px]">
        {/* 頂欄 */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-2 border-ink/15 bg-bg/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2.5 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Sparkles size={15} />
            </span>
            <span className="font-black">Sales Next</span>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted md:flex">
            <Briefcase size={15} />
            桃園新竹｜AI Sales Pipeline 工作區
          </div>
          <div className="flex items-center gap-2.5">
            {/* 視角切換 */}
            <div className="flex rounded-full border border-ink/20 bg-surface p-0.5 text-xs font-medium">
              <button
                onClick={() => setView("rep")}
                className={`rounded-full px-3 py-1.5 transition ${
                  view === "rep" ? "bg-primary text-white" : "text-ink-2"
                }`}
              >
                業務視角
              </button>
              <button
                onClick={() => setView("manager")}
                className={`rounded-full px-3 py-1.5 transition ${
                  view === "manager" ? "bg-primary text-white" : "text-ink-2"
                }`}
              >
                主管視角
              </button>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              <UserRound size={16} />
            </span>
          </div>
        </header>

        {hydrated && <WorkspaceAnalysisStrip />}

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          {hydrated ? children : <div className="py-24 text-center text-muted">載入工作區…</div>}
        </main>
      </div>

      {/* 手機底部導覽（PWA） */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface/95 px-2 py-1.5 backdrop-blur md:hidden">
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[10px] ${
              active(href) ? "text-primary" : "text-muted"
            }`}
          >
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
