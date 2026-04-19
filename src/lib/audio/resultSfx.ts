/**
 * Session results sting: `public/sound/result.mp3`
 *
 * With `next.config` `basePath` / `assetPrefix`, the browser must request
 * `${NEXT_PUBLIC_BASE_PATH}/sound/result.mp3`, not `/sound/result.mp3` alone.
 *
 * Preload after PLAY (user gesture). Play after END (same gesture chain as click, or from panel rAF).
 */

const RESULT_REL = "/sound/result.mp3";

const DEFAULT_MAX_AUDIBLE_MS = 3000;
const FADE_MS = 200;

let cached: HTMLAudioElement | null = null;
let lastConfiguredUrl = "";

let fadeIntervalId: number | null = null;
let capTimeoutId: number | null = null;

/** Resolved URL for the exported site (GitHub Pages) and local dev. */
export function getResultSfxUrl(): string {
  const base = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
  const trimmed = String(base).replace(/\/$/, "");
  return trimmed ? `${trimmed}${RESULT_REL}` : RESULT_REL;
}

function getOrCreateAudio(): HTMLAudioElement {
  if (typeof window === "undefined") {
    throw new Error("resultSfx: window is not available");
  }
  const url = getResultSfxUrl();
  if (!cached) {
    cached = new Audio();
    cached.preload = "auto";
    cached.loop = false;
    console.info("[resultSfx] HTMLAudioElement created");
  }
  if (lastConfiguredUrl !== url) {
    cached.src = url;
    lastConfiguredUrl = url;
    console.info("[resultSfx] audio src set", { url, resolvedSrc: cached.src });
  }
  return cached;
}

/** Cancel timers and stop playback; restore volume for the next one-shot. */
export function stopResultSfx(): void {
  if (typeof window === "undefined") return;
  if (fadeIntervalId != null) {
    clearInterval(fadeIntervalId);
    fadeIntervalId = null;
  }
  if (capTimeoutId != null) {
    clearTimeout(capTimeoutId);
    capTimeoutId = null;
  }
  if (!cached) return;
  cached.pause();
  try {
    cached.currentTime = 0;
  } catch {
    /* ignore */
  }
  cached.volume = 1;
}

/** Warm decode pipeline — call from PLAY (after user interaction). */
export function preloadResultSfx(): void {
  if (typeof window === "undefined") return;
  try {
    const a = getOrCreateAudio();
    void a.load();
    console.info("[resultSfx] preload requested", { src: a.src });
  } catch (e) {
    console.warn("[resultSfx] preload failed", e);
  }
}

/**
 * One-shot: play from the start during the results count-up.
 * After `maxAudibleMs`, fades out briefly then stops (non-looping).
 */
export function playResultSfxForResultsBuild(options?: {
  maxAudibleMs?: number;
  fadeOutMs?: number;
}): void {
  if (typeof window === "undefined") return;

  const maxAudibleMs = options?.maxAudibleMs ?? DEFAULT_MAX_AUDIBLE_MS;
  const fadeOutMs = Math.min(options?.fadeOutMs ?? FADE_MS, Math.max(0, maxAudibleMs - 50));

  stopResultSfx();

  try {
    const a = getOrCreateAudio();
    a.volume = 1;

    const startFadeAt = Math.max(0, maxAudibleMs - fadeOutMs);

    capTimeoutId = window.setTimeout(() => {
      capTimeoutId = null;
      const steps = 10;
      const stepMs = Math.max(16, Math.floor(fadeOutMs / steps));
      let step = 0;
      fadeIntervalId = window.setInterval(() => {
        step += 1;
        a.volume = Math.max(0, 1 - step / steps);
        if (step >= steps) {
          if (fadeIntervalId != null) clearInterval(fadeIntervalId);
          fadeIntervalId = null;
          a.pause();
          try {
            a.currentTime = 0;
          } catch {
            /* ignore */
          }
          a.volume = 1;
        }
      }, stepMs);
    }, startFadeAt);

    a.currentTime = 0;
    console.info("[resultSfx] play() triggered", { src: a.src, maxAudibleMs });

    void a
      .play()
      .then(() => {
        console.info("[resultSfx] play() resolved — audio should be audible", {
          currentTime: a.currentTime,
          paused: a.paused,
          volume: a.volume,
        });
      })
      .catch((err: unknown) => {
        console.warn("[resultSfx] play() rejected — check autoplay policy / src URL", err);
      });
  } catch (e) {
    console.warn("[resultSfx] playResultSfxForResultsBuild failed", e);
  }
}

/** @deprecated Use `playResultSfxForResultsBuild` + `stopResultSfx`. */
export function playResultSfxOnce(): void {
  playResultSfxForResultsBuild();
}
