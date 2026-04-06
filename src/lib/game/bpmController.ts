/**
 * Step 7: streak-based BPM adjustments tied to group sync. Does not own the audio clock —
 * callers apply returned BPM via `AudioEngine.setBpmPreservingPlaybackBeat`.
 */

import type { GroupSyncBeatResult } from "./types";

/** Require this many consecutive strong beats before +5 BPM. */
export const BPM_GOOD_STREAK_BEATS = 8;
export const BPM_STEP_UP = 5;
export const BPM_GOOD_THRESHOLD = 0.75;

/** Require this many weak beats before a small step down. */
export const BPM_POOR_STREAK_BEATS = 5;
export const BPM_STEP_DOWN = 2;
export const BPM_POOR_THRESHOLD = 0.45;

export const BPM_MAX = 120;

export class BpmProgressionController {
  private goodStreak = 0;
  private poorStreak = 0;
  private minBpm: number;

  constructor(trackBaseBpm: number) {
    this.minBpm = computeFloorBpm(trackBaseBpm);
  }

  /** After loading a new track or explicit reset from UI. */
  reset(trackBaseBpm: number): void {
    this.goodStreak = 0;
    this.poorStreak = 0;
    this.minBpm = computeFloorBpm(trackBaseBpm);
  }

  /** User moved BPM slider or similar — clear streaks so automation stays predictable. */
  onManualBpmChange(trackBaseBpm: number): void {
    this.goodStreak = 0;
    this.poorStreak = 0;
    this.minBpm = computeFloorBpm(trackBaseBpm);
  }

  /**
   * @param currentBpm — authoritative value from React / engine
   */
  onBeatFinalized(
    result: GroupSyncBeatResult,
    currentBpm: number
  ): { bpm: number; changed: boolean } {
    let next = currentBpm;
    const g = result.groupSyncRate;
    const active = result.activePlayerCount > 0;

    if (g > BPM_GOOD_THRESHOLD) {
      this.goodStreak += 1;
      this.poorStreak = 0;
    } else {
      this.goodStreak = 0;
      if (active && g < BPM_POOR_THRESHOLD) {
        this.poorStreak += 1;
      } else {
        this.poorStreak = Math.max(0, this.poorStreak - 1);
      }
    }

    let changed = false;

    if (this.goodStreak >= BPM_GOOD_STREAK_BEATS && next < BPM_MAX) {
      next = Math.min(BPM_MAX, next + BPM_STEP_UP);
      this.goodStreak = 0;
      changed = true;
    }

    if (!changed && this.poorStreak >= BPM_POOR_STREAK_BEATS && next > this.minBpm) {
      next = Math.max(this.minBpm, next - BPM_STEP_DOWN);
      this.poorStreak = 0;
      changed = true;
    }

    return { bpm: next, changed };
  }
}

function computeFloorBpm(base: number): number {
  const b = Number.isFinite(base) ? base : 100;
  return Math.max(55, Math.min(b, BPM_MAX) - 15);
}
