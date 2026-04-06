/**
 * Train a lightweight dense classifier on fixed-length flattened pose sequences (TensorFlow.js).
 */

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import { ML_FEATURES_PER_FRAME } from "./joints";
import { resampleSequenceToVector } from "./recording";
import type { CustomSequenceSample } from "./types";
import { CUSTOM_IDLE_LABEL } from "./types";

/** Fixed temporal length after resampling (matches inference window). */
export const DEFAULT_SEQUENCE_FRAMES = 16;

/**
 * Canonical class order: `idle` first, then user labels sorted lexicographically.
 */
export function canonicalClassNames(userDefinedLabels: readonly string[]): string[] {
  const cleaned = userDefinedLabels
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s !== CUSTOM_IDLE_LABEL);
  const uniq = [...new Set(cleaned)].sort((a, b) => a.localeCompare(b));
  return [CUSTOM_IDLE_LABEL, ...uniq];
}

/** Input vector size for the model. */
export function inputVectorLength(sequenceFrames: number): number {
  return sequenceFrames * ML_FEATURES_PER_FRAME;
}

export type TrainReadiness = { ok: true } | { ok: false; reason: string };

/**
 * Require idle + at least one custom class, and ≥1 sample per class in the vocabulary.
 */
export function validateTrainingReadiness(
  samples: readonly CustomSequenceSample[],
  classNames: readonly string[]
): TrainReadiness {
  if (classNames.length < 2) {
    return { ok: false, reason: "Add at least one custom class (idle is always included)." };
  }
  if (!classNames.includes(CUSTOM_IDLE_LABEL)) {
    return { ok: false, reason: "Internal error: idle missing from class list." };
  }
  const counts = new Map<string, number>();
  for (const c of classNames) counts.set(c, 0);
  for (const s of samples) {
    const k = normalizeLabel(s.label);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const c of classNames) {
    if ((counts.get(c) ?? 0) < 1) {
      return { ok: false, reason: `Need at least one recorded sample for "${c}".` };
    }
  }
  return { ok: true };
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export type TrainProgress = {
  epoch: number;
  epochs: number;
  loss?: number;
  acc?: number;
};

/**
 * Build and fit a softmax classifier. Caller disposes the returned model when replacing it.
 */
export async function trainCustomClassifier(
  samples: readonly CustomSequenceSample[],
  classNames: readonly string[],
  sequenceFrames: number,
  options: {
    epochs?: number;
    onProgress?: (p: TrainProgress) => void;
  } = {}
): Promise<tf.LayersModel> {
  await tf.setBackend("webgl");
  await tf.ready();

  const epochs = options.epochs ?? 80;
  const labelToIndex = new Map(classNames.map((n, i) => [n, i] as const));

  const xsData: number[] = [];
  const ysData: number[] = [];
  const inputDim = inputVectorLength(sequenceFrames);

  for (const s of samples) {
    const lab = normalizeLabel(s.label);
    const yi = labelToIndex.get(lab);
    if (yi === undefined) continue;
    const v = resampleSequenceToVector(s.frames, sequenceFrames);
    if (v.length !== inputDim) continue;
    for (let i = 0; i < v.length; i++) xsData.push(v[i]!);
    ysData.push(yi);
  }

  if (ysData.length === 0) {
    throw new Error("No training rows after filtering labels.");
  }

  const xsTensor = tf.tensor2d(xsData, [ysData.length, inputDim]);
  const ysTensor = tf.oneHot(tf.tensor1d(ysData, "int32"), classNames.length);

  const useVal = ysData.length >= 10;

  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        units: 128,
        activation: "relu",
        inputShape: [inputDim],
      }),
      tf.layers.dropout({ rate: 0.25 }),
      tf.layers.dense({ units: 72, activation: "relu" }),
      tf.layers.dense({ units: classNames.length, activation: "softmax" }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.002),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  await model.fit(xsTensor, ysTensor, {
    epochs,
    batchSize: Math.min(16, Math.max(4, ysData.length)),
    shuffle: true,
    validationSplit: useVal ? 0.12 : 0,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        options.onProgress?.({
          epoch: epoch + 1,
          epochs,
          loss: logs?.loss,
          acc: logs?.acc,
        });
      },
    },
  });

  xsTensor.dispose();
  ysTensor.dispose();
  return model;
}
