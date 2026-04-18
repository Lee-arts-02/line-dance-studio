/**
 * Performance-mode interval summary (default 20s) — headline + combo / flow peaks.
 */

import type { GroupSyncIntervalReport } from "./types";

export type PerformanceSummaryStats = {
  headline: string;
  peakSyncCombo: number;
  peakCorrectCombo: number;
  teamFlowEnd: number;
  flowLevel: TeamFlowLevel;
};

export type TeamFlowLevel = "LOW" | "MID" | "HIGH" | "MAX";

export function teamFlowToLevel(flow: number): TeamFlowLevel {
  if (flow >= 0.95) return "MAX";
  if (flow >= 0.65) return "HIGH";
  if (flow >= 0.35) return "MID";
  return "LOW";
}

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

export function groupSyncRateFromReport(report: GroupSyncIntervalReport): number {
  return report.overallGroupSync;
}

export type IntervalSessionSnapshot = {
  peakSyncCombo: number;
  peakCorrectCombo: number;
  teamFlowEnd: number;
};

export function buildPerformanceSummaryStats(
  report: GroupSyncIntervalReport,
  session: IntervalSessionSnapshot
): PerformanceSummaryStats {
  const acc = groupJudgmentAccuracyRate(report);
  const sync = groupSyncRateFromReport(report);
  const flowLevel = teamFlowToLevel(session.teamFlowEnd);
  const headline = pickSummaryHeadline(
    flowLevel,
    session.peakSyncCombo,
    session.peakCorrectCombo,
    sync,
    acc
  );

  return {
    headline,
    peakSyncCombo: session.peakSyncCombo,
    peakCorrectCombo: session.peakCorrectCombo,
    teamFlowEnd: session.teamFlowEnd,
    flowLevel,
  };
}

function pickSummaryHeadline(
  flowLevel: TeamFlowLevel,
  peakSync: number,
  peakCorrect: number,
  overallSync: number,
  overallAcc: number
): string {
  const combo = Math.max(peakSync, peakCorrect);
  if (flowLevel === "MAX" && combo >= 12) return "🔥 LOCKED IN! 🔥";
  if (flowLevel === "MAX") return "🔥 PERFECT TEAM 🔥";
  if (combo >= 10 && overallSync >= 0.72) return "GREAT TEAM!";
  if (flowLevel === "HIGH") return "NICE FLOW!";
  if (overallAcc >= 0.65 && overallSync >= 0.55) return "KEEP IT TIGHT!";
  if (peakSync >= 6 || peakCorrect >= 6) return "ON BEAT!";
  return "FEEL THE GROOVE!";
}
