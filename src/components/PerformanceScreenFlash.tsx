"use client";

type PerformanceScreenFlashProps = {
  /** Bump to replay a light full-frame flash (team flow max). */
  flashKey: number;
};

/**
 * One-shot white wash over the camera stack — not mirrored (absolute over stage).
 */
export function PerformanceScreenFlash({ flashKey }: PerformanceScreenFlashProps) {
  if (flashKey <= 0) return null;
  return (
    <div
      key={flashKey}
      className="pointer-events-none absolute inset-0 z-[24] bg-white [animation:perf-screen-flash_0.32s_ease-out_forwards]"
      aria-hidden
    />
  );
}
