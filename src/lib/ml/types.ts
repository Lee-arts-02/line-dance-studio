/**
 * Types for browser-side custom action training (TensorFlow.js).
 * Built-in gameplay actions (`step_left`, `step_right`, `clap`) stay in `src/lib/dance/sequence.ts`.
 */

import type { MlJointName } from "./joints";

export type { MlJointName } from "./joints";

/** Reserved label for the negative / neutral class in the custom classifier. */
export const CUSTOM_IDLE_LABEL = "idle" as const;

/** Named joints per frame (COCO17 subset). */
export type MlKeypoint = {
  x: number;
  y: number;
  score: number;
};

/** One frame of normalized landmarks (torso-centered, scale-normalized). */
export type PoseFrameRecord = {
  t: number;
  keypoints: Record<MlJointName, MlKeypoint>;
};

/** One recorded sequence assigned to a custom class name (including `idle`). */
export type CustomSequenceSample = {
  id: string;
  label: string;
  createdAt: string;
  playerId: number;
  frameCount: number;
  frames: PoseFrameRecord[];
};

/** Model + label mapping persisted via TF.js `localStorage://` IO. */
export type CustomModelMetadata = {
  schemaVersion: 1;
  /** Ordered class names: index 0 = `idle`, then user classes sorted. */
  classNames: string[];
  inputFrames: number;
  featureDimPerFrame: number;
  trainedAt: string;
};
