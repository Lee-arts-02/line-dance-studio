/**
 * Short rolling pose history per tracked player for motion-based action recognition (Step 4).
 */

import type { PoseKeypoint, StablePlayerId, TorsoCenter } from "./types";

/** One sampled frame for a single player. */
export type PoseHistoryFrame = {
  /** Monotonic clock (e.g. performance.now()). */
  t: number;
  playerId: StablePlayerId;
  torso: TorsoCenter;
  keypoints: PoseKeypoint[];
};

/** Slightly longer buffer for dynamic clap (open→close) trends. */
const DEFAULT_MAX_FRAMES = 10;

/**
 * Ring buffer of recent frames for one player (oldest at index 0).
 */
export class PlayerPoseHistory {
  private frames: PoseHistoryFrame[] = [];
  private readonly maxLen: number;

  constructor(maxLen = DEFAULT_MAX_FRAMES) {
    this.maxLen = Math.max(3, maxLen);
  }

  push(frame: PoseHistoryFrame): void {
    this.frames.push(frame);
    while (this.frames.length > this.maxLen) {
      this.frames.shift();
    }
  }

  clear(): void {
    this.frames = [];
  }

  get length(): number {
    return this.frames.length;
  }

  /** Oldest → newest. */
  get all(): readonly PoseHistoryFrame[] {
    return this.frames;
  }

  /** Most recent frame or undefined. */
  get latest(): PoseHistoryFrame | undefined {
    const n = this.frames.length;
    return n ? this.frames[n - 1] : undefined;
  }
}

/**
 * Keeps a {@link PlayerPoseHistory} per active player id.
 */
export class MultiPlayerPoseHistory {
  private readonly maxPerPlayer: number;
  private readonly byPlayer = new Map<StablePlayerId, PlayerPoseHistory>();

  constructor(maxPerPlayer = DEFAULT_MAX_FRAMES) {
    this.maxPerPlayer = maxPerPlayer;
  }

  push(frame: PoseHistoryFrame): void {
    let h = this.byPlayer.get(frame.playerId);
    if (!h) {
      h = new PlayerPoseHistory(this.maxPerPlayer);
      this.byPlayer.set(frame.playerId, h);
    }
    h.push(frame);
  }

  historyFor(playerId: StablePlayerId): PlayerPoseHistory | undefined {
    return this.byPlayer.get(playerId);
  }

  /** Drop histories for players that are no longer tracked. */
  pruneMissing(activePlayerIds: ReadonlySet<StablePlayerId>): void {
    for (const id of this.byPlayer.keys()) {
      if (!activePlayerIds.has(id)) {
        this.byPlayer.delete(id);
      }
    }
  }

  clear(): void {
    this.byPlayer.clear();
  }
}

// --- Motion trend helpers (use oldest→newest frame order) ---

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Horizontal displacement of torso from early segment to late segment (robust to jitter).
 * Positive = moved right in image space; negative = moved left.
 */
export function torsoHorizontalDelta(frames: readonly PoseHistoryFrame[]): number | null {
  const n = frames.length;
  if (n < 4) return null;
  const k = Math.max(2, Math.min(3, Math.floor(n / 3)));
  const early = frames.slice(0, k);
  const late = frames.slice(n - k);
  const earlyX = mean(early.map((f) => f.torso.x));
  const lateX = mean(late.map((f) => f.torso.x));
  return lateX - earlyX;
}

/** Simple finite difference velocity of torso x (last − first) over full window. */
export function torsoHorizontalVelocityX(frames: readonly PoseHistoryFrame[]): number | null {
  if (frames.length < 3) return null;
  const a = frames[0].torso.x;
  const b = frames[frames.length - 1].torso.x;
  return b - a;
}

/**
 * Total horizontal spread of torso x over the window (max − min).
 * Used to reject “stomp” when the body is actually traveling side-to-side.
 */
export function torsoHorizontalRange(frames: readonly PoseHistoryFrame[]): number | null {
  if (frames.length < 3) return null;
  let minX = frames[0]!.torso.x;
  let maxX = frames[0]!.torso.x;
  for (const f of frames) {
    const x = f.torso.x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return maxX - minX;
}

/**
 * Largest |Δtorso.x| between consecutive frames (captures brief lateral shuffles).
 */
export function torsoMaxFrameToFrameDeltaX(frames: readonly PoseHistoryFrame[]): number | null {
  if (frames.length < 2) return null;
  let m = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i]!.torso.x - frames[i - 1]!.torso.x);
    if (d > m) m = d;
  }
  return m;
}

/**
 * Average x of a keypoint across frames (skips if any sample missing).
 */
export function averageKeypointX(
  frames: readonly PoseHistoryFrame[],
  index: number
): number | null {
  const xs: number[] = [];
  for (const f of frames) {
    const kp = f.keypoints[index];
    if (!kp) return null;
    xs.push(kp.x);
  }
  return mean(xs);
}
