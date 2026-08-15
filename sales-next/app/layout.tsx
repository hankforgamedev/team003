import type { Metadata, Viewport } from "next";
import { DM_Sans, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import "@sales-next/knowledge-base/styles.css";
import "./kb-styles.css";
import AppShell from "@/components/AppShell";

const noto = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto",
});

const dm = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm",
});

export const metadata: Metadata = {
  title: "Sales Next｜開會後，下一步就清楚了",
  description:
    "給臺灣 B2B 中小企業 Sales Team 的 AI Sales Assistant：會議錄音 → 逐字稿 → 自動 CRM → 知識庫 → 漏斗分析 → Next Best Action。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Sales Next", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#152039",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={`${noto.variable} ${dm.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
