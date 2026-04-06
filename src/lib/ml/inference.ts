/**
 * Run the trained custom classifier on a short pose sequence window.
 *
 * Training uses the same vectorization path: `resampleSequenceToVector` in `recording.ts`
 * (torso-centered + scale-normalized joints, fixed joint order, temporal resampling to `sequenceFrames`).
 */

import * as tf from "@tensorflow/tfjs";
import type { LayersModel } from "@tensorflow/tfjs";
import { resampleSequenceToVector } from "./recording";
import type { PoseFrameRecord } from "./types";

export type CustomPrediction = {
  /** Winning label */
  label: string;
  /** Softmax probability of the winning class */
  confidence: number;
  /** Full softmax (aligned with `classNames` order) */
  probs: Float32Array;
};

/**
 * Predict from a buffer of recent normalized frames (newest frame last).
 */
export function predictCustomSequence(
  model: LayersModel,
  classNames: readonly string[],
  frames: readonly PoseFrameRecord[],
  sequenceFrames: number
): CustomPrediction {
  const v = resampleSequenceToVector(frames, sequenceFrames);
  const probs = tf.tidy(() => {
    const t = tf.tensor2d([Array.from(v)], [1, v.length]);
    const out = model.predict(t) as tf.Tensor;
    return out.dataSync() as Float32Array;
  });

  let best = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i]! > probs[best]!) best = i;
  }
  return {
    label: classNames[best] ?? "?",
    confidence: probs[best] ?? 0,
    probs,
  };
}
