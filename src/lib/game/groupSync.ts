/**
 * Team-level sync per action+rest pair (same judgments as personal scoring).
 */

import {
  ACTION_BLOCK_BEATS,
  getExpectedActionForPairIndex,
  type BeatSlot,
  type SequenceActionId,
} from "@/lib/dance/sequence";
import type { StablePlayerId } from "@/lib/pose/types";
import type {
  GroupSyncBeatResult,
  GroupSyncIntervalReport,
  GroupSyncStatusLabel,
  JudgmentResult,
} from "./types";

export const GROUP_SYNC_SPREAD_MAX_MS = 300;
/** Performance summary / interval aggregation window (group accuracy + sync over full window). */
export const STATS_INTERVAL_MS = 20_000;

/**
 * Finalize pair `P` after its window ends: when beat float passes the end of the rest beat + offset.
 */
export const GROUP_SYNC_FINALIZE_BEAT_OFFSET = 0.45;

export const GROUP_SYNC_STATUS_TIGHT_MIN = 0.85;
export const GROUP_SYNC_STATUS_GOOD_MIN = 0.65;

export type PlayerBeatRecord = {
  correct: boolean;
  audioTimeSec: number;
};

type IntervalSample = {
  finalizedAtSec: number;
  groupSyncRate: number;
  groupAccuracy: number;
  outcomes: Array<{ playerId: StablePlayerId; correct: boolean }>;
};

export type GroupSyncTrackerOptions = {
  statsIntervalMs?: number;
};

export type GroupSyncTickOutput = {
  latestBlockResult: GroupSyncBeatResult | null;
  intervalReports: GroupSyncIntervalReport[];
};

function statusFromRate(groupSyncRate: number): GroupSyncStatusLabel {
  if (groupSyncRate >= GROUP_SYNC_STATUS_TIGHT_MIN) return "tight";
  if (groupSyncRate >= GROUP_SYNC_STATUS_GOOD_MIN) return "good";
  return "loose";
}

export function computeGroupSyncBlockResult(
  pairIndex: number,
  activePlayerIds: readonly StablePlayerId[],
  records: ReadonlyMap<StablePlayerId, PlayerBeatRecord>,
  sequence: readonly BeatSlot[]
): GroupSyncBeatResult {
  const expected = getExpectedActionForPairIndex(pairIndex, sequence);
  const expectedAction: SequenceActionId = expected ?? "step_left";
  const blockStartBeat = pairIndex * ACTION_BLOCK_BEATS;

  if (activePlayerIds.length === 0) {
    return {
      blockIndex: pairIndex,
      blockStartBeat,
      expectedAction,
      activePlayerCount: 0,
      correctPlayerCount: 0,
      groupAccuracy: 0,
      timeSpreadMs: null,
      timeSpreadMeaningful: false,
      groupSyncRate: 0,
      statusLabel: "loose",
    };
  }

  let correctPlayerCount = 0;
  for (const id of activePlayerIds) {
    const r = records.get(id);
    if (r?.correct) correctPlayerCount += 1;
  }

  const groupAccuracy = correctPlayerCount / activePlayerIds.length;

  const judgedTimes: number[] = [];
  for (const [, record] of records) {
    judgedTimes.push(record.audioTimeSec);
  }

  let timeSpreadMs: number | null = null;
  let timeSpreadMeaningful = false;

  if (judgedTimes.length >= 2) {
    timeSpreadMeaningful = true;
    let minT = judgedTimes[0]!;
    let maxT = judgedTimes[0]!;
    for (const t of judgedTimes) {
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
    timeSpreadMs = (maxT - minT) * 1000;
  }

  let groupSyncRate: number;
  if (judgedTimes.length === 0) {
    groupSyncRate = 0;
  } else if (!timeSpreadMeaningful || timeSpreadMs === null) {
    groupSyncRate = 1;
  } else {
    groupSyncRate = Math.max(0, 1 - timeSpreadMs / GROUP_SYNC_SPREAD_MAX_MS);
  }

  return {
    blockIndex: pairIndex,
    blockStartBeat,
    expectedAction,
    activePlayerCount: activePlayerIds.length,
    correctPlayerCount,
    groupAccuracy,
    timeSpreadMs,
    timeSpreadMeaningful,
    groupSyncRate,
    statusLabel: statusFromRate(groupSyncRate),
  };
}

/**
 * Finalizes each global pair at most once when the audio clock passes the end of that pair’s window.
 */
export class GroupSyncTracker {
  private lastFinalizedBlock = -1;
  private readonly pending = new Map<number, Map<StablePlayerId, PlayerBeatRecord>>();
  private readonly statsIntervalMs: number;
  private intervalStartSec: number | null = null;
  private readonly intervalSamples: IntervalSample[] = [];

  constructor(options: GroupSyncTrackerOptions = {}) {
    this.statsIntervalMs = options.statsIntervalMs ?? STATS_INTERVAL_MS;
  }

  recordAppliedJudgment(
    pairIndex: number,
    playerId: StablePlayerId,
    result: JudgmentResult,
    audioTimeSec: number
  ): void {
    const correct = result.kind === "perfect" || result.kind === "good";
    let m = this.pending.get(pairIndex);
    if (!m) {
      m = new Map();
      this.pending.set(pairIndex, m);
    }
    m.set(playerId, { correct, audioTimeSec });
  }

  tick(
    currentBeatFloat: number,
    currentAudioTimeSec: number,
    activePlayerIds: readonly StablePlayerId[],
    sequence: readonly BeatSlot[]
  ): GroupSyncTickOutput {
    this.ensureIntervalStart(currentAudioTimeSec);

    let latestBlockResult: GroupSyncBeatResult | null = null;
    while (true) {
      const nextPair = this.lastFinalizedBlock + 1;
      const threshold =
        (nextPair + 1) * ACTION_BLOCK_BEATS + GROUP_SYNC_FINALIZE_BEAT_OFFSET;
      if (currentBeatFloat < threshold) break;
      const pair = nextPair;
      const records = this.pending.get(pair) ?? new Map();
      const result = computeGroupSyncBlockResult(pair, activePlayerIds, records, sequence);
      this.pushIntervalSample(currentAudioTimeSec, result, records);
      this.pending.delete(pair);
      this.lastFinalizedBlock = pair;
      latestBlockResult = result;
    }

    const intervalReports = this.drainIntervalReportsUpTo(currentAudioTimeSec);
    return { latestBlockResult, intervalReports };
  }

  reset(): void {
    this.lastFinalizedBlock = -1;
    this.pending.clear();
    this.intervalStartSec = null;
    this.intervalSamples.length = 0;
  }

  private ensureIntervalStart(currentAudioTimeSec: number): void {
    if (this.intervalStartSec == null) {
      this.intervalStartSec = currentAudioTimeSec;
    }
  }

  private pushIntervalSample(
    finalizedAtSec: number,
    result: GroupSyncBeatResult,
    records: ReadonlyMap<StablePlayerId, PlayerBeatRecord>
  ): void {
    const outcomes = Array.from(records, ([playerId, record]) => ({
      playerId,
      correct: record.correct,
    }));
    this.intervalSamples.push({
      finalizedAtSec,
      groupSyncRate: result.groupSyncRate,
      groupAccuracy: result.groupAccuracy,
      outcomes,
    });
  }

  private drainIntervalReportsUpTo(currentAudioTimeSec: number): GroupSyncIntervalReport[] {
    if (this.intervalStartSec == null) return [];

    const out: GroupSyncIntervalReport[] = [];
    const intervalSec = this.statsIntervalMs / 1000;
    let intervalStartSec = this.intervalStartSec;

    while (currentAudioTimeSec - intervalStartSec >= intervalSec) {
      const intervalEndSec = intervalStartSec + intervalSec;
      const inWindow: IntervalSample[] = [];
      const keep: IntervalSample[] = [];
      for (const s of this.intervalSamples) {
        if (s.finalizedAtSec < intervalEndSec) inWindow.push(s);
        else keep.push(s);
      }
      this.intervalSamples.length = 0;
      this.intervalSamples.push(...keep);

      out.push(this.buildIntervalReport(intervalStartSec, intervalEndSec, inWindow));
      intervalStartSec = intervalEndSec;
      this.intervalStartSec = intervalEndSec;
    }

    return out;
  }

  private buildIntervalReport(
    intervalStartSec: number,
    intervalEndSec: number,
    samples: readonly IntervalSample[]
  ): GroupSyncIntervalReport {
    const sampleCount = samples.length;
    const overallGroupSync =
      sampleCount > 0 ? samples.reduce((a, s) => a + s.groupSyncRate, 0) / sampleCount : 0;
    const overallGroupAccuracy =
      sampleCount > 0 ? samples.reduce((a, s) => a + s.groupAccuracy, 0) / sampleCount : 0;

    const perPlayer = new Map<StablePlayerId, { judgedCount: number; correctCount: number }>();
    for (const s of samples) {
      for (const o of s.outcomes) {
        const agg = perPlayer.get(o.playerId) ?? { judgedCount: 0, correctCount: 0 };
        agg.judgedCount += 1;
        if (o.correct) agg.correctCount += 1;
        perPlayer.set(o.playerId, agg);
      }
    }

    const individualAccuracies = Array.from(perPlayer, ([playerId, agg]) => ({
      playerId,
      judgedCount: agg.judgedCount,
      correctCount: agg.correctCount,
      averageAccuracy: agg.judgedCount > 0 ? agg.correctCount / agg.judgedCount : 0,
    })).sort((a, b) => a.playerId - b.playerId);

    return {
      intervalStartSec,
      intervalEndSec,
      intervalMs: this.statsIntervalMs,
      evaluatedBlockCount: sampleCount,
      individualAccuracies,
      overallGroupSync,
      overallGroupAccuracy,
    };
  }
}
