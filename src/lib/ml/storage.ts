/**
 * Persist custom samples + TF.js model in the browser (localStorage only — no backend).
 */

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import type { LayersModel } from "@tensorflow/tfjs";
import type { CustomModelMetadata, CustomSequenceSample } from "./types";

const SAMPLES_KEY = "music3-custom-samples-v1";
const META_KEY = "music3-custom-model-meta-v1";
const MODEL_IO_PREFIX = "localstorage://music3-custom-action-model";

export function loadSamplesFromStorage(): CustomSequenceSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomSequenceSample[];
  } catch {
    return [];
  }
}

export function saveSamplesToStorage(samples: readonly CustomSequenceSample[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
  } catch {
    /* quota — ignore */
  }
}

export function clearSamplesStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAMPLES_KEY);
}

export function loadModelMetaFromStorage(): CustomModelMetadata | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomModelMetadata;
  } catch {
    return null;
  }
}

export function saveModelMetaToStorage(meta: CustomModelMetadata): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function clearModelMetaStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(META_KEY);
}

/** Save trained weights + architecture to browser localStorage (TF.js IO). */
export async function saveCustomModelToBrowser(
  model: LayersModel,
  meta: CustomModelMetadata
): Promise<void> {
  await tf.setBackend("webgl");
  await tf.ready();
  await model.save(MODEL_IO_PREFIX);
  saveModelMetaToStorage(meta);
}

/** Reload a previously saved model (returns null if none). */
export async function loadCustomModelFromBrowser(): Promise<{
  model: LayersModel;
  meta: CustomModelMetadata;
} | null> {
  if (typeof window === "undefined") return null;
  try {
    const meta = loadModelMetaFromStorage();
    if (!meta) return null;
    await tf.setBackend("webgl");
    await tf.ready();
    const model = await tf.loadLayersModel(MODEL_IO_PREFIX);
    return { model, meta };
  } catch {
    return null;
  }
}

/** Remove saved TF.js artifacts + metadata (samples untouched). */
export async function clearSavedCustomModel(): Promise<void> {
  clearModelMetaStorage();
  if (typeof window === "undefined") return;
  const ls = window.localStorage;
  const prefix = "tensorflowjs_models/music3-custom-action-model";
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => ls.removeItem(k));
}
