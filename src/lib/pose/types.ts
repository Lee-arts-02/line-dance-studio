/**
 * App-level pose types (Step 3). Kept separate from TF exports for stable boundaries.
 */

/** Confidence threshold for treating a keypoint as visible (tune with detector). */
export const KEYPOINT_CONFIDENCE_THRESHOLD = 0.3;

/** Max simultaneous players (MoveNet MultiPose supports up to 6; we cap at 5). */
export const MAX_TRACKED_PLAYERS = 5;

/** 1-based stable slot id shown in the UI: "Player 1" … "Player 5". */
export type StablePlayerId = 1 | 2 | 3 | 4 | 5;

/** Normalized or pixel keypoint from the detector (mirrors TF Keypoint shape). */
export interface PoseKeypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

/** Mid-torso point from shoulders + hips (for association across frames). */
export interface TorsoCenter {
  x: number;
  y: number;
}

/** One tracked person after ID assignment. */
export interface TrackedPerson {
  playerId: StablePlayerId;
  keypoints: PoseKeypoint[];
  torso: TorsoCenter;
  /** Overall pose confidence when available. */
  poseScore?: number;
}
