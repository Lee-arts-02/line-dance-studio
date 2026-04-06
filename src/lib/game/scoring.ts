/**
 * Per-player score state: points, combo, last action beat judged, judgment flash window.
 */

import type { StablePlayerId } from "@/lib/pose/types";
import type { JudgmentResult, PlayerScoreState } from "./types";

/** How long the latest judgment label stays emphasized (ms). */
export const JUDGMENT_DISPLAY_MS = 650;

const initialState = (): PlayerScoreState => ({
  totalScore: 0,
  combo: 0,
  latestJudgment: null,
  latestExpectedAction: null,
  lastJudgedBeatIndex: null,
  judgmentVisibleUntilPerf: 0,
});

/**
 * In-memory scoreboard for local play. One row per player id.
 */
export class PlayerScoreboard {
  private readonly scores = new Map<StablePlayerId, PlayerScoreState>();

  get(playerId: StablePlayerId): PlayerScoreState {
    return this.scores.get(playerId) ?? initialState();
  }

  /**
   * Apply a judgment if this global `targetBeatIndex` was not already judged for this player.
   */
  applyJudgment(playerId: StablePlayerId, result: JudgmentResult, nowPerf: number): boolean {
    const prev = this.get(playerId);
    if (prev.lastJudgedBeatIndex === result.targetBeatIndex) {
      return false;
    }

    const nextCombo = result.kind === "miss" ? 0 : prev.combo + 1;

    const next: PlayerScoreState = {
      totalScore: prev.totalScore + result.pointsAwarded,
      combo: nextCombo,
      latestJudgment: result.kind,
      latestExpectedAction: result.expectedAction,
      lastJudgedBeatIndex: result.targetBeatIndex,
      judgmentVisibleUntilPerf: nowPerf + JUDGMENT_DISPLAY_MS,
    };

    this.scores.set(playerId, next);
    return true;
  }

  reset(): void {
    this.scores.clear();
  }
}

export function createInitialPlayerScoreState(): PlayerScoreState {
  return initialState();
}

export function isJudgmentVisible(state: PlayerScoreState, nowPerf: number): boolean {
  return state.latestJudgment != null && nowPerf < state.judgmentVisibleUntilPerf;
}
