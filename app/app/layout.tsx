import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design.css";
import "./plan-browser.css";
import "./review-chart.css";
import "./execution-calendar.css";
import "./complete-task.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "PDS diary — 오늘의 계획과 기록",
  description: "계획하고, 기록하고, 다음 계획으로 이어가는 나의 다이어리",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#172123', colorScheme: 'dark', interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
