"use client";

import { useCallback, useRef, useState } from "react";
import { buildPerformanceSummaryStats } from "@/lib/game/performanceSummary";
import type { GroupSyncIntervalReport } from "@/lib/game/types";

/**
 * Drives the performance summary overlay from closed 60s `GroupSyncTracker` intervals.
 * Ingest is O(n) over `individualAccuracies` only when an interval fires (~once per minute).
 */
export type PerformanceSummaryCycle = {
  key: number;
  stats: ReturnType<typeof buildPerformanceSummaryStats>;
};

/** Performance-mode 60s summary overlay state (feeds off `GroupSyncTracker` interval reports). */
export function usePerformanceMetrics(performanceMode: boolean) {
  const perfRef = useRef(performanceMode);
  perfRef.current = performanceMode;

  const [cycle, setCycle] = useState<PerformanceSummaryCycle | null>(null);
  const seqRef = useRef(0);

  /** Call when `GroupSyncTracker` emits interval report(s); only the latest is shown if multiple. */
  const ingestIntervalReport = useCallback((report: GroupSyncIntervalReport) => {
    if (!perfRef.current) return;
    seqRef.current += 1;
    setCycle({
      key: seqRef.current,
      stats: buildPerformanceSummaryStats(report),
    });
  }, []);

  const dismissCycle = useCallback(() => {
    setCycle(null);
  }, []);

  return { cycle, ingestIntervalReport, dismissCycle };
}
