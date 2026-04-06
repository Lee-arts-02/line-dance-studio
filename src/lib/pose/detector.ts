/**
 * MoveNet MultiPose (TensorFlow.js) — loading and per-frame estimation.
 * All TF imports are dynamic to keep SSR bundles clean and load only in the browser.
 */

import type { PoseDetector } from "@tensorflow-models/pose-detection";

export type DetectorStatus = "idle" | "loading" | "ready" | "error";

const MAX_POSES = 5;

let backendReady: Promise<void> | null = null;

/** Ensure WebGL backend is ready once per page lifetime. */
async function ensureTfBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = (async () => {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();
    })();
  }
  return backendReady;
}

/**
 * Create a MoveNet MultiPose Lightning detector (browser only).
 */
export async function createMoveNetMultiPoseDetector(): Promise<PoseDetector> {
  await ensureTfBackend();
  const poseDetection = await import("@tensorflow-models/pose-detection");
  const movenet = poseDetection.movenet;

  return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: movenet.modelType.MULTIPOSE_LIGHTNING,
    enableSmoothing: true,
    // We assign stable UI ids in our tracker; internal MoveNet tracking disabled.
    enableTracking: false,
    minPoseScore: 0.15,
    multiPoseMaxDimension: 320,
  });
}

/**
 * Run pose estimation on a video frame.
 */
export async function estimatePosesFromVideo(
  detector: PoseDetector,
  video: HTMLVideoElement,
  options?: { maxPoses?: number; flipHorizontal?: boolean }
): Promise<import("@tensorflow-models/pose-detection").Pose[]> {
  const maxPoses = Math.min(options?.maxPoses ?? MAX_POSES, MAX_POSES);
  /** Default false: keypoints match raw video; mirror the preview in the UI instead. */
  const flipHorizontal = options?.flipHorizontal ?? false;
  return detector.estimatePoses(video, {
    maxPoses,
    flipHorizontal,
  });
}

export { MAX_POSES };
