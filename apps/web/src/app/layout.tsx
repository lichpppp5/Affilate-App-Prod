import type { ReactNode } from "react";

import "./globals.css";

import { AppShell } from "../components/app-shell";

export const metadata = {
  title: "AppAffilate",
  description: "Nền tảng vận hành video và affiliate đa kênh"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
