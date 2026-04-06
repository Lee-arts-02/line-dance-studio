/**
 * Multi-person association with hip-weighted torso, EMA smoothing, and sticky single-player matching.
 */

import type { Pose } from "@tensorflow-models/pose-detection";
import {
  KEYPOINT_CONFIDENCE_THRESHOLD,
  MAX_TRACKED_PLAYERS,
  type PoseKeypoint,
  type StablePlayerId,
  type TorsoCenter,
  type TrackedPerson,
} from "./types";

const IDX = {
  leftShoulder: 5,
  rightShoulder: 6,
  leftHip: 11,
  rightHip: 12,
} as const;

/** Frames to keep a track before removal (longer = more stable through noisy poses). */
const MAX_MISSED_FRAMES = 52;

/** Smooth matched torso observations to reduce jitter from arm motion. */
const TORSO_EMA_ALPHA = 0.42;

/** Base match radius as fraction of max(video w, h). */
const MATCH_RADIUS_BASE = 0.13;
/** Looser matching when few people (reduces ID swaps). */
const MATCH_RADIUS_FEW = 0.22;
/** Single candidate + single track: always pair (ignore distance). */
const SINGLE_PAIR_FORCE = true;

function clampPlayerId(n: number): StablePlayerId {
  return Math.min(5, Math.max(1, n)) as StablePlayerId;
}

function min4(a: number, b: number, c: number, d: number): number {
  return Math.min(a, b, c, d);
}

/**
 * Torso for tracking: hips weighted more than shoulders so raised arms perturb less.
 */
export function computeTrackingTorso(
  keypoints: PoseKeypoint[],
  minScore = 0.22
): TorsoCenter | null {
  const ls = keypoints[IDX.leftShoulder];
  const rs = keypoints[IDX.rightShoulder];
  const lh = keypoints[IDX.leftHip];
  const rh = keypoints[IDX.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  if (min4(ls.score ?? 0, rs.score ?? 0, lh.score ?? 0, rh.score ?? 0) < minScore) {
    return null;
  }
  return {
    x: (ls.x + rs.x) * 0.2 + (lh.x + rh.x) * 0.3,
    y: (ls.y + rs.y) * 0.2 + (lh.y + rh.y) * 0.3,
  };
}

/**
 * Legacy torso (even shoulder/hip weights) — kept for callers expecting the old helper.
 */
export function computeTorsoCenter(
  keypoints: PoseKeypoint[],
  minScore = KEYPOINT_CONFIDENCE_THRESHOLD
): TorsoCenter | null {
  const ls = keypoints[IDX.leftShoulder];
  const rs = keypoints[IDX.rightShoulder];
  const lh = keypoints[IDX.leftHip];
  const rh = keypoints[IDX.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  if (min4(ls.score ?? 0, rs.score ?? 0, lh.score ?? 0, rh.score ?? 0) < minScore) {
    return null;
  }
  return {
    x: (ls.x + rs.x + lh.x + rh.x) / 4,
    y: (ls.y + rs.y + lh.y + rh.y) / 4,
  };
}

function dist2(a: TorsoCenter, b: TorsoCenter): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function blendTorso(prev: TorsoCenter, obs: TorsoCenter, alpha: number): TorsoCenter {
  return {
    x: alpha * obs.x + (1 - alpha) * prev.x,
    y: alpha * obs.y + (1 - alpha) * prev.y,
  };
}

function toPoseKeypoints(kps: Pose["keypoints"]): PoseKeypoint[] {
  return kps.map((k) => ({
    x: k.x,
    y: k.y,
    score: k.score,
    name: k.name,
  }));
}

type InternalTrack = {
  playerId: StablePlayerId;
  /** Latest raw observation (for debug). */
  torso: TorsoCenter;
  /** Smoothed position used for distance matching. */
  torsoSmooth: TorsoCenter;
  missed: number;
};

export class TorsoProximityTracker {
  private tracks: InternalTrack[] = [];

  update(poses: Pose[], frameScale: number): TrackedPerson[] {
    const scale = Math.max(frameScale, 1);

    const candidates: {
      keypoints: PoseKeypoint[];
      torso: TorsoCenter;
      poseScore?: number;
    }[] = [];

    for (const p of poses) {
      const kps = toPoseKeypoints(p.keypoints);
      const torso = computeTrackingTorso(kps);
      if (!torso) continue;
      candidates.push({
        keypoints: kps,
        torso,
        poseScore: p.score,
      });
    }

    const nCand = candidates.length;
    const nTrack = this.tracks.length;

    // Sticky single-player: one detection, one track → always the same person.
    if (SINGLE_PAIR_FORCE && nCand === 1 && nTrack === 1) {
      const c = candidates[0];
      const t = this.tracks[0];
      const smooth = blendTorso(t.torsoSmooth, c.torso, TORSO_EMA_ALPHA);
      this.tracks = [
        {
          playerId: t.playerId,
          torso: c.torso,
          torsoSmooth: smooth,
          missed: 0,
        },
      ];
      return [
        {
          playerId: t.playerId,
          keypoints: c.keypoints,
          poseScore: c.poseScore,
          torso: c.torso,
        },
      ];
    }

    const fewPeople = nCand <= 2 && nTrack <= 2;
    const r2 = (scale * (fewPeople ? MATCH_RADIUS_FEW : MATCH_RADIUS_BASE)) ** 2;

    type Pair = { ti: number; ci: number; d2: number };
    const pairs: Pair[] = [];
    for (let ti = 0; ti < nTrack; ti++) {
      for (let ci = 0; ci < nCand; ci++) {
        const d2 = dist2(this.tracks[ti].torsoSmooth, candidates[ci].torso);
        if (d2 <= r2) pairs.push({ ti, ci, d2 });
      }
    }
    pairs.sort((a, b) => a.d2 - b.d2);

    const usedT = new Set<number>();
    const usedC = new Set<number>();
    const assignment = new Map<number, number>();
    for (const p of pairs) {
      if (usedT.has(p.ti) || usedC.has(p.ci)) continue;
      usedT.add(p.ti);
      usedC.add(p.ci);
      assignment.set(p.ti, p.ci);
    }

    const nextTracks: InternalTrack[] = [];
    const out: TrackedPerson[] = [];

    for (let ti = 0; ti < nTrack; ti++) {
      const ci = assignment.get(ti);
      if (ci !== undefined) {
        const c = candidates[ci];
        const prev = this.tracks[ti];
        const smooth = blendTorso(prev.torsoSmooth, c.torso, TORSO_EMA_ALPHA);
        nextTracks.push({
          playerId: prev.playerId,
          torso: c.torso,
          torsoSmooth: smooth,
          missed: 0,
        });
        out.push({
          playerId: prev.playerId,
          keypoints: c.keypoints,
          poseScore: c.poseScore,
          torso: c.torso,
        });
      } else {
        const prev = this.tracks[ti];
        const missed = prev.missed + 1;
        if (missed <= MAX_MISSED_FRAMES) {
          nextTracks.push({ ...prev, missed });
        }
      }
    }

    const usedCand = new Set(assignment.values());
    const takenIds = new Set(nextTracks.map((t) => t.playerId));

    for (let ci = 0; ci < nCand; ci++) {
      if (usedCand.has(ci)) continue;
      if (nextTracks.length >= MAX_TRACKED_PLAYERS) break;

      let farFromAll = true;
      const c = candidates[ci];
      for (const nt of nextTracks) {
        if (dist2(nt.torsoSmooth, c.torso) < r2 * 1.1) {
          farFromAll = false;
          break;
        }
      }
      if (!farFromAll && nCand > 1) continue;

      const pid = this.allocPlayerId(takenIds);
      if (pid === null) break;
      takenIds.add(pid);
      nextTracks.push({
        playerId: pid,
        torso: c.torso,
        torsoSmooth: c.torso,
        missed: 0,
      });
      out.push({
        playerId: pid,
        keypoints: c.keypoints,
        poseScore: c.poseScore,
        torso: c.torso,
      });
    }

    this.tracks = nextTracks;
    out.sort((a, b) => a.playerId - b.playerId);
    return out;
  }

  private allocPlayerId(taken: Set<StablePlayerId>): StablePlayerId | null {
    for (let n = 1; n <= MAX_TRACKED_PLAYERS; n++) {
      const id = clampPlayerId(n);
      if (!taken.has(id)) return id;
    }
    return null;
  }

  reset(): void {
    this.tracks = [];
  }
}
