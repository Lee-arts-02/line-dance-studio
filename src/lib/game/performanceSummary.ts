/**
 * Performance-mode interval summary (default 20s) — headline + combo / flow peaks.
 */

import type { GroupSyncIntervalReport } from "./types";

export type PerformanceSummaryStats = {
  headline: string;
  /** True only for the first 20s summary this session — larger headline + transition animation in UI. */
  isFirstRoundTransition?: boolean;
  peakSyncCombo: number;
  peakCorrectCombo: number;
  teamFlowEnd: number;
  flowLevel: TeamFlowLevel;
};

/** Short stage cues mixed into later 20s summaries (no long sentences). */
const SWITCH_STYLE_HEADLINES: readonly string[] = [
  "SWITCH",
  "KEEP THE FLOW!",
  "GOOD JOB!",
  "STAY IN SYNC!",
  "GREAT TEAM!",
];

export type BuildPerformanceSummaryOptions = {
  /**
   * Monotonic counter for interval overlays this session (first summary = 1).
   * Used for rotating “switch” style lines after the first cycle.
   */
  intervalSeq: number;
  /** When true, headline is always the first-round transition line (caller sets once per session). */
  isFirstIntervalOverlay: boolean;
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
  session: IntervalSessionSnapshot,
  opts: BuildPerformanceSummaryOptions
): PerformanceSummaryStats {
  const acc = groupJudgmentAccuracyRate(report);
  const sync = groupSyncRateFromReport(report);
  const flowLevel = teamFlowToLevel(session.teamFlowEnd);

  const isFirst = opts.isFirstIntervalOverlay;
  const headline = isFirst
    ? "NEXT ROUND!"
    : pickPostFirstPerformanceHeadline(
        opts.intervalSeq,
        flowLevel,
        session.peakSyncCombo,
        session.peakCorrectCombo,
        sync,
        acc
      );

  return {
    headline,
    isFirstRoundTransition: isFirst,
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

/**
 * Headlines for 2nd+ 20s overlay: mostly stats-driven stage lines, with periodic short “switch” cues.
 * `intervalSeq` is the same counter passed to `buildPerformanceSummaryStats` (>= 2 here).
 */
function pickPostFirstPerformanceHeadline(
  intervalSeq: number,
  flowLevel: TeamFlowLevel,
  peakSync: number,
  peakCorrect: number,
  overallSync: number,
  overallAcc: number
): string {
  const base = pickSummaryHeadline(flowLevel, peakSync, peakCorrect, overallSync, overallAcc);
  /** First slot at seq 3, then every 5th (8, 13, …) — keeps rhythm without drowning out feedback. */
  if (intervalSeq >= 3 && (intervalSeq - 3) % 5 === 0) {
    const i = Math.floor((intervalSeq - 3) / 5) % SWITCH_STYLE_HEADLINES.length;
    return SWITCH_STYLE_HEADLINES[i]!;
  }
  return base;
}
