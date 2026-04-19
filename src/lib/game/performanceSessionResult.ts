/**
 * End-of-performance evaluation from cumulative session totals (short stage phrases).
 */

export type PerformanceSessionResult = {
  syncTotal: number;
  correctTotal: number;
  teamFlowFinal: number;
  peakTeamFlow: number;
  durationSec: number;
  message: string;
};

/**
 * Derives a single energetic line from totals + flow — no long sentences.
 */
export function computeFinalEvaluationMessage(r: PerformanceSessionResult): string {
  const { syncTotal, correctTotal, teamFlowFinal, peakTeamFlow } = r;
  const flow = Math.max(teamFlowFinal, peakTeamFlow * 0.95);

  if (flow >= 0.88 && syncTotal >= 12 && correctTotal >= 12) return "LOCKED IN!";
  if (syncTotal >= 8 && correctTotal >= 8 && flow >= 0.65) return "GREAT TEAMWORK!";
  if (correctTotal >= 10 && flow >= 0.55) return "ON BEAT!";
  if (syncTotal + correctTotal >= 20 && flow >= 0.45) return "FEEL THE GROOVE!";
  if (flow >= 0.4) return "NICE FLOW!";
  if (syncTotal + correctTotal >= 6) return "KEEP IT TIGHT!";
  return "STAY IN SYNC!";
}
