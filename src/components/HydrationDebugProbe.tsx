"use client";

import { useLayoutEffect } from "react";

function collectBodyAttrReport() {
  const attrs: Record<string, string> = {};
  for (let i = 0; i < document.body.attributes.length; i++) {
    const a = document.body.attributes.item(i);
    if (a) attrs[a.name] = a.value;
  }
  const names = Object.keys(attrs);
  const grammarlyLike = names.filter(
    (n) =>
      n.includes("gr-") ||
      n.includes("grammarly") ||
      n.startsWith("data-new-gr") ||
      n === "data-gr-ext-installed"
  );
  return {
    attributeNames: names.sort(),
    grammarlyLike,
    className: attrs.class ?? "",
  };
}

export function HydrationDebugProbe() {
  useLayoutEffect(() => {
    const report = collectBodyAttrReport();
    // #region agent log
    fetch("http://127.0.0.1:7786/ingest/02e79b40-c730-4925-99af-c8a4d3f1feec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0c4567",
      },
      body: JSON.stringify({
        sessionId: "0c4567",
        location: "HydrationDebugProbe.tsx:useLayoutEffect",
        message: "client body DOM attributes after commit",
        data: {
          ...report,
          h1_extensionMarkersPresent: report.grammarlyLike.length > 0,
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
        runId: "post-fix",
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  return null;
}
