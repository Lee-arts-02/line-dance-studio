/**
 * Shared joint vocabulary for ML (subset of COCO17).
 */

export type MlJointName =
  | "nose"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

export const ML_JOINT_ORDER: readonly MlJointName[] = [
  "nose",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
] as const;

export const ML_JOINT_COUNT = ML_JOINT_ORDER.length;

/** x, y, score per joint per frame. */
export const ML_FEATURES_PER_FRAME = ML_JOINT_COUNT * 3;
