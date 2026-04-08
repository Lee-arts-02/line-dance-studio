/**
 * Performance-mode summary metrics derived from `GroupSyncIntervalReport`.
 * Reuses the existing 60s window from `GroupSyncTracker` (beat-finalized sync + per-player correctness).
 */

import type { GroupSyncIntervalReport } from "./types";

export type PerformanceSummaryStats = {
  /** 0–100, proportion of correct judgments across all players in the window */
  accuracyPct: number;
  /** 0–100, mean timing alignment (`groupSyncRate`) across finalized blocks */
  syncPct: number;
  message: string;
};

/**
 * Group accuracy: total correct / total judged across every player in the interval.
 * Falls back to `overallGroupAccuracy` when no per-player judgments were recorded.
 */
export function groupJudgmentAccuracyRate(report: GroupSyncIntervalReport): number {
  let judged = 0;
  let correct = 0;
  for (const row of report.individualAccuracies) {
    judged += row.judgedCount;
    correct += row.correctCount;
  }
  if (judged > 0) return correct / judged;
  return report.overallGroupAccuracy;
}

/** Group sync: existing `overallGroupSync` (time spread between players per finalized block, averaged). */
export function groupSyncRateFromReport(report: GroupSyncIntervalReport): number {
  return report.overallGroupSync;
}

/**
 * Motivational line from sync + accuracy (both 0–100).
 * Order: strongest combined bar first, then sync tiers.
 */
export function performanceMotivationalMessage(syncPct: number, accuracyPct: number): string {
  if (syncPct >= 90 && accuracyPct >= 85) return "You're a perfect team!";
  if (syncPct >= 75) return "Great teamwork!";
  if (syncPct >= 60) return "Good job, keep going!";
  return "Keep practicing together!";
}

export function buildPerformanceSummaryStats(report: GroupSyncIntervalReport): PerformanceSummaryStats {
  const acc = groupJudgmentAccuracyRate(report);
  const sync = groupSyncRateFromReport(report);
  const accuracyPct = Math.round(acc * 100);
  const syncPct = Math.round(sync * 100);
  return {
    accuracyPct,
    syncPct,
    message: performanceMotivationalMessage(syncPct, accuracyPct),
  };
}
