import type { Metadata } from "next";
import { HydrationDebugProbe } from "@/components/HydrationDebugProbe";
import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Music3 — Line Dance Prototype",
  description: "Rhythm-based dance platform prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // #region agent log
  void fetch("http://127.0.0.1:7786/ingest/02e79b40-c730-4925-99af-c8a4d3f1feec", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0c4567",
    },
    body: JSON.stringify({
      sessionId: "0c4567",
      location: "layout.tsx:RootLayout",
      message: "server render expected body props only",
      data: {
        expectedBodyClassName: "antialiased",
        h2_claim: "If client adds attrs beyond this, mismatch unless extension",
      },
      timestamp: Date.now(),
      hypothesisId: "H2",
      runId: "post-fix",
    }),
  }).catch(() => {});
  // #endregion

  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <HydrationDebugProbe />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
