/**
 * Step 7: reward feedback driven by finalized group sync scores (visual layer only).
 */

import type { GroupSyncBeatResult } from "./types";

export type RewardTier = "none" | "glow" | "confetti";

/**
 * Snapshot for HUD / overlays. Controllers are recreated or reset when the track changes.
 */
export type RewardVisualState = {
  tier: RewardTier;
  /** Consecutive finalized beats with groupSyncRate >= 0.9 (resets on weaker beats). */
  highSyncStreak: number;
  /** Short banner line, or null when tier is none. */
  banner: string | null;
};

const THRESHOLD_GLOW = 0.8;
const THRESHOLD_STRONG = 0.9;
/** Consecutive beats at/above THRESHOLD_STRONG to unlock confetti. */
const CONSECUTIVE_FOR_CONFETTI = 2;

export function createNeutralRewardState(): RewardVisualState {
  return { tier: "none", highSyncStreak: 0, banner: null };
}

/**
 * Updates reward feedback from one finalized group-sync beat. Idempotent per beat from caller.
 */
export class RewardFeedbackController {
  private highSyncStreak = 0;

  reset(): void {
    this.highSyncStreak = 0;
  }

  onBeatFinalized(result: GroupSyncBeatResult): RewardVisualState {
    const g = result.groupSyncRate;

    if (g >= THRESHOLD_STRONG) {
      this.highSyncStreak += 1;
    } else {
      this.highSyncStreak = 0;
    }

    if (g >= THRESHOLD_STRONG && this.highSyncStreak >= CONSECUTIVE_FOR_CONFETTI) {
      return {
        tier: "confetti",
        highSyncStreak: this.highSyncStreak,
        banner: "PERFECT GROUP",
      };
    }

    if (g >= THRESHOLD_GLOW) {
      return {
        tier: "glow",
        highSyncStreak: this.highSyncStreak,
        banner: "GREAT SYNC",
      };
    }

    return {
      tier: "none",
      highSyncStreak: this.highSyncStreak,
      banner: null,
    };
  }
}
