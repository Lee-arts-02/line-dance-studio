/**
 * Primary-person selection, pose quality gates, ML frames, and sequence vectorization for training.
 */

import { computeTorsoCenter } from "@/lib/pose/tracker";
import type { PoseKeypoint, StablePlayerId, TrackedPerson } from "@/lib/pose/types";
import { KEYPOINT_CONFIDENCE_THRESHOLD } from "@/lib/pose/types";
import {
  ML_FEATURES_PER_FRAME,
  ML_JOINT_ORDER,
  type MlJointName,
} from "./joints";
import type { PoseFrameRecord } from "./types";

/** COCO17 indices (same as skeleton comments in pose/skeleton.ts). */
const COCO: Record<MlJointName, number> = {
  nose: 0,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
};

/** Minimum score for “core” joints when deciding if a pose is usable for recording. */
const CORE_CONF = 0.28;

function bboxArea(person: TrackedPerson): number {
  const kps = person.keypoints;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const kp of kps) {
    if ((kp.score ?? 0) < 0.15) continue;
    any = true;
    minX = Math.min(minX, kp.x);
    maxX = Math.max(maxX, kp.x);
    minY = Math.min(minY, kp.y);
    maxY = Math.max(maxY, kp.y);
  }
  if (!any) return 0;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/**
 * When multiple people are visible, pick the largest on-screen footprint (proxy for main / closest).
 */
export function selectPrimaryPlayer(tracked: TrackedPerson[]): TrackedPerson | null {
  if (tracked.length === 0) return null;
  let best = tracked[0]!;
  let bestA = bboxArea(best);
  for (let i = 1; i < tracked.length; i++) {
    const p = tracked[i]!;
    const a = bboxArea(p);
    if (a > bestA) {
      bestA = a;
      best = p;
    }
  }
  return best;
}

export function findPlayerById(
  tracked: TrackedPerson[],
  id: StablePlayerId
): TrackedPerson | undefined {
  return tracked.find((p) => p.playerId === id);
}

/**
 * Require torso + shoulders + hips so the body is roughly facing the camera.
 */
export function isPoseStableEnough(person: TrackedPerson): boolean {
  const torso = computeTorsoCenter(person.keypoints, CORE_CONF);
  if (!torso) return false;
  const ls = person.keypoints[5];
  const rs = person.keypoints[6];
  const lh = person.keypoints[11];
  const rh = person.keypoints[12];
  if (!ls || !rs || !lh || !rh) return false;
  const scores = [ls, rs, lh, rh].map((k) => k.score ?? 0);
  if (scores.some((s) => s < CORE_CONF)) return false;
  return true;
}

function kpScore(kp: PoseKeypoint | undefined): number {
  return kp?.score ?? 0;
}

function normalizeJoint(
  kp: PoseKeypoint | undefined,
  cx: number,
  cy: number,
  scale: number
) {
  const s = Math.max(scale, 1e-6);
  return {
    x: ((kp?.x ?? cx) - cx) / s,
    y: ((kp?.y ?? cy) - cy) / s,
    score: kpScore(kp),
  };
}

function bodyScale(person: TrackedPerson): number {
  const ls = person.keypoints[5];
  const rs = person.keypoints[6];
  const lh = person.keypoints[11];
  const rh = person.keypoints[12];
  const shoulderW =
    ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : 0;
  const hipW = lh && rh ? Math.hypot(lh.x - rh.x, lh.y - rh.y) : 0;
  return Math.max(shoulderW, hipW, 40);
}

/**
 * Build one ML frame: torso-centered, scale-normalized keypoints for the compact joint set.
 */
export function buildPoseFrameRecord(tMs: number, person: TrackedPerson): PoseFrameRecord | null {
  const torso = computeTorsoCenter(person.keypoints, KEYPOINT_CONFIDENCE_THRESHOLD * 0.85);
  if (!torso) return null;
  const scale = bodyScale(person);
  const kps = person.keypoints;
  const keypoints = {} as PoseFrameRecord["keypoints"];
  for (const name of ML_JOINT_ORDER) {
    const idx = COCO[name];
    keypoints[name] = normalizeJoint(kps[idx], torso.x, torso.y, scale);
  }
  return { t: tMs, keypoints };
}

/**
 * Flatten one frame in a fixed joint order: [x,y,s,...] per joint.
 */
export function flattenFrame(record: PoseFrameRecord): Float32Array {
  const out = new Float32Array(ML_FEATURES_PER_FRAME);
  let o = 0;
  for (const name of ML_JOINT_ORDER) {
    const k = record.keypoints[name];
    out[o++] = k.x;
    out[o++] = k.y;
    out[o++] = k.score;
  }
  return out;
}

/**
 * Resample a variable-length sequence to `targetFrames` steps (evenly spaced in time) and flatten.
 * Used as the input vector for the dense sequence classifier.
 */
export function resampleSequenceToVector(
  frames: readonly PoseFrameRecord[],
  targetFrames: number
): Float32Array {
  const tf = Math.max(1, targetFrames);
  const flat = new Float32Array(tf * ML_FEATURES_PER_FRAME);
  if (frames.length === 0) return flat;

  const t0 = frames[0]!.t;
  const t1 = frames[frames.length - 1]!.t;
  const span = Math.max(t1 - t0, 1e-6);

  for (let i = 0; i < tf; i++) {
    const u = tf === 1 ? 0 : i / (tf - 1);
    const tgt = t0 + u * span;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid]!.t <= tgt) lo = mid;
      else hi = mid;
    }
    const a = frames[lo]!;
    const b = frames[Math.min(lo + 1, frames.length - 1)]!;
    const denom = Math.max(b.t - a.t, 1e-6);
    const w = (tgt - a.t) / denom;
    const sliceOffset = i * ML_FEATURES_PER_FRAME;
    let o = 0;
    for (const name of ML_JOINT_ORDER) {
      const ka = a.keypoints[name];
      const kb = b.keypoints[name];
      flat[sliceOffset + o++] = ka.x + w * (kb.x - ka.x);
      flat[sliceOffset + o++] = ka.y + w * (kb.y - ka.y);
      flat[sliceOffset + o++] = ka.score + w * (kb.score - ka.score);
    }
  }
  return flat;
}
