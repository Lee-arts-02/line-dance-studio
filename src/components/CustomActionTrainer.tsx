"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PoseDetector } from "@tensorflow-models/pose-detection";
import { useCustomModel } from "@/context/CustomModelContext";
import { DANCE_ACTION_IDS } from "@/lib/dance/sequence";
import { ActionRecognitionEngine, formatActionLabel } from "@/lib/pose/actions";
import {
  createMoveNetMultiPoseDetector,
  estimatePosesFromVideo,
} from "@/lib/pose/detector";
import { predictCustomSequence } from "@/lib/ml/inference";
import {
  buildPoseFrameRecord,
  findPlayerById,
  isPoseStableEnough,
  selectPrimaryPlayer,
} from "@/lib/ml/recording";
import {
  clearSamplesStorage,
  loadSamplesFromStorage,
  saveCustomModelToBrowser,
  saveSamplesToStorage,
} from "@/lib/ml/storage";
import { ML_FEATURES_PER_FRAME } from "@/lib/ml/joints";
import {
  canonicalClassNames,
  DEFAULT_SEQUENCE_FRAMES,
  normalizeLabel,
  trainCustomClassifier,
  validateTrainingReadiness,
} from "@/lib/ml/training";
import type { CustomSequenceSample, PoseFrameRecord } from "@/lib/ml/types";
import { CUSTOM_IDLE_LABEL } from "@/lib/ml/types";
import {
  buildTrainerTorsoLines,
  drawTorsoActionLabels,
} from "@/lib/pose/bodyActionLabels";
import { mapVideoToMirroredOverlay } from "@/lib/pose/mirroredVideoMap";
import { COCO17_EDGES, playerHue, shouldDrawEdge } from "@/lib/pose/skeleton";
import { TorsoProximityTracker } from "@/lib/pose/tracker";
import { KEYPOINT_CONFIDENCE_THRESHOLD, type StablePlayerId } from "@/lib/pose/types";
import type { TrackedPerson } from "@/lib/pose/types";

const RECORDING_DURATION_MS = 1250;
const COUNTDOWN_SECONDS = 3;
const MIN_FRAMES_PER_SAMPLE = 8;
const MAX_CONSECUTIVE_BAD_FRAMES = 14;
/** Rolling buffer for live custom inference (raw frames before resampling). */
const LIVE_BUFFER_MAX = 48;

type DetectorUiStatus = "loading" | "ready" | "error";
type CapturePhase = "idle" | "countdown" | "recording";

function newSampleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function drawSinglePerson(
  ctx: CanvasRenderingContext2D,
  person: TrackedPerson,
  vw: number,
  vh: number,
  cw: number,
  ch: number,
  conf: number,
  loose: number
) {
  const stroke = playerHue(person.playerId);
  for (const [i, j] of COCO17_EDGES) {
    const a = person.keypoints[i];
    const b = person.keypoints[j];
    if (!a || !b) continue;
    if (!shouldDrawEdge(a.score, b.score, i, j, conf, loose)) continue;
    const p1 = mapVideoToMirroredOverlay(a.x, a.y, vw, vh, cw, ch);
    const p2 = mapVideoToMirroredOverlay(b.x, b.y, vw, vh, cw, ch);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  person.keypoints.forEach((kp) => {
    const s = kp.score ?? 0;
    if (s < conf) return;
    const p = mapVideoToMirroredOverlay(kp.x, kp.y, vw, vh, cw, ch);
    ctx.fillStyle = stroke;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function countCustomByLabel(samples: readonly CustomSequenceSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) {
    const k = normalizeLabel(s.label);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * In-browser custom action training + live TF.js inference.
 * Built-in rule-based actions (`DANCE_ACTION_IDS`) are separate and unchanged.
 */
export function CustomActionTrainer() {
  const {
    model: ctxModel,
    metadata: ctxMetadata,
    refreshFromStorage,
    clearStoredModel,
  } = useCustomModel();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const trackerRef = useRef(new TorsoProximityTracker());
  const actionEngineRef = useRef(new ActionRecognitionEngine(14));
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const phaseRef = useRef<CapturePhase>("idle");
  const lockedPlayerIdRef = useRef<StablePlayerId | null>(null);
  const lockedLabelRef = useRef<string>(CUSTOM_IDLE_LABEL);
  const recordingStartRef = useRef(0);
  const framesBufferRef = useRef<PoseFrameRecord[]>([]);
  const badFrameStreakRef = useRef(0);
  const countdownBadStreakRef = useRef(0);
  const recordingFinalizedRef = useRef(false);
  const lastRecordingUiPushRef = useRef(0);
  const countdownTimerIdsRef = useRef<number[]>([]);
  const liveFrameBufferRef = useRef<PoseFrameRecord[]>([]);
  const lastTrackedRef = useRef<TrackedPerson[]>([]);
  const inferModelRef = useRef(ctxModel);
  const inferMetaRef = useRef(ctxMetadata);
  useEffect(() => {
    inferModelRef.current = ctxModel;
    inferMetaRef.current = ctxMetadata;
  }, [ctxModel, ctxMetadata]);

  const [detectorStatus, setDetectorStatus] = useState<DetectorUiStatus>("loading");
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [poseOk, setPoseOk] = useState(false);
  const [peopleCount, setPeopleCount] = useState(0);
  const [fps, setFps] = useState(0);

  const [userCustomClasses, setUserCustomClasses] = useState<string[]>([]);
  const [newClassInput, setNewClassInput] = useState("");
  const [samples, setSamples] = useState<CustomSequenceSample[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [recordLabel, setRecordLabel] = useState<string>(CUSTOM_IDLE_LABEL);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [countdownNum, setCountdownNum] = useState<number | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordingFrameCount, setRecordingFrameCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const [builtinHint, setBuiltinHint] = useState<string | null>(null);
  const [customPred, setCustomPred] = useState<{ label: string; confidence: number } | null>(null);

  const [training, setTraining] = useState(false);
  const [trainLog, setTrainLog] = useState<string | null>(null);

  const classNames = useMemo(
    () => canonicalClassNames(userCustomClasses),
    [userCustomClasses]
  );

  useEffect(() => {
    const s = loadSamplesFromStorage();
    setSamples(s);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSamplesToStorage(samples);
  }, [samples, hydrated]);

  const clearCountdownTimers = useCallback(() => {
    for (const id of countdownTimerIdsRef.current) {
      window.clearTimeout(id);
    }
    countdownTimerIdsRef.current = [];
  }, []);

  const resetCaptureRefs = useCallback(() => {
    phaseRef.current = "idle";
    lockedPlayerIdRef.current = null;
    framesBufferRef.current = [];
    badFrameStreakRef.current = 0;
    countdownBadStreakRef.current = 0;
    recordingFinalizedRef.current = false;
    setPhase("idle");
    setCountdownNum(null);
    setRecordingElapsedMs(0);
    setRecordingFrameCount(0);
  }, []);

  const failCapture = useCallback(
    (msg: string) => {
      clearCountdownTimers();
      resetCaptureRefs();
      setStatusMessage(msg);
    },
    [clearCountdownTimers, resetCaptureRefs]
  );

  const beginRecordingWindow = useCallback(() => {
    clearCountdownTimers();
    setCountdownNum(null);
    phaseRef.current = "recording";
    setPhase("recording");
    recordingStartRef.current = performance.now();
    framesBufferRef.current = [];
    badFrameStreakRef.current = 0;
    recordingFinalizedRef.current = false;
    lastRecordingUiPushRef.current = 0;
    setRecordingFrameCount(0);
  }, [clearCountdownTimers]);

  const finalizeRecording = useCallback(() => {
    if (recordingFinalizedRef.current) return;
    recordingFinalizedRef.current = true;

    const pid = lockedPlayerIdRef.current;
    const labelNow = normalizeLabel(lockedLabelRef.current);
    const buf = framesBufferRef.current;

    if (pid == null) {
      failCapture("Recording ended without an active player id.");
      return;
    }
    if (buf.length < MIN_FRAMES_PER_SAMPLE) {
      failCapture(
        `Sample discarded: only ${buf.length} good frames (need at least ${MIN_FRAMES_PER_SAMPLE}).`
      );
      return;
    }

    const sample: CustomSequenceSample = {
      id: newSampleId(),
      label: labelNow,
      createdAt: new Date().toISOString(),
      playerId: pid,
      frameCount: buf.length,
      frames: buf.map((f) => ({ t: f.t, keypoints: { ...f.keypoints } })),
    };

    setSamples((prev) => [...prev, sample]);
    setLastSaved(`Saved “${labelNow}” (${buf.length} frames).`);
    resetCaptureRefs();
    setStatusMessage(null);
  }, [failCapture, resetCaptureRefs]);

  const startCountdown = useCallback(() => {
    setStatusMessage(null);
    setLastSaved(null);
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setStatusMessage("Camera not ready yet.");
      return;
    }

    const tracked = lastTrackedRef.current;
    const primary = selectPrimaryPlayer(tracked);
    if (!primary || !isPoseStableEnough(primary)) {
      setStatusMessage("Need a clear, full upper-body pose in frame to record.");
      return;
    }

    const lab = normalizeLabel(recordLabel);
    if (!classNames.includes(lab)) {
      setStatusMessage("Pick a class that exists in the list (add custom classes first).");
      return;
    }

    lockedPlayerIdRef.current = primary.playerId;
    lockedLabelRef.current = lab;
    phaseRef.current = "countdown";
    setPhase("countdown");
    setCountdownNum(COUNTDOWN_SECONDS);
    countdownBadStreakRef.current = 0;

    clearCountdownTimers();
    const t0 = window.setTimeout(() => setCountdownNum(2), 1000);
    const t1 = window.setTimeout(() => setCountdownNum(1), 2000);
    const t2 = window.setTimeout(() => beginRecordingWindow(), 3000);
    countdownTimerIdsRef.current = [t0, t1, t2];
  }, [beginRecordingWindow, clearCountdownTimers, classNames, recordLabel]);

  const addCustomClass = useCallback(() => {
    const raw = newClassInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw || raw.length > 48) return;
    if (!/^[a-z0-9_]+$/.test(raw)) {
      setStatusMessage("Use letters, numbers, and underscores only.");
      return;
    }
    if (raw === CUSTOM_IDLE_LABEL) {
      setStatusMessage(`“${CUSTOM_IDLE_LABEL}” is built-in — pick another name.`);
      return;
    }
    setUserCustomClasses((prev) => (prev.includes(raw) ? prev : [...prev, raw]));
    setNewClassInput("");
    setStatusMessage(null);
  }, [newClassInput]);

  const deleteCustomClass = useCallback((name: string) => {
    const n = normalizeLabel(name);
    if (n === CUSTOM_IDLE_LABEL) return;
    setUserCustomClasses((prev) => prev.filter((x) => x !== n));
    setSamples((prev) => prev.filter((s) => normalizeLabel(s.label) !== n));
  }, []);

  const onTrain = useCallback(async () => {
    const readiness = validateTrainingReadiness(samples, classNames);
    if (!readiness.ok) {
      setTrainLog(readiness.reason);
      return;
    }
    setTraining(true);
    setTrainLog("Training…");
    try {
      const m = await trainCustomClassifier(samples, classNames, DEFAULT_SEQUENCE_FRAMES, {
        epochs: 80,
        onProgress: (p) => {
          setTrainLog(
            `Epoch ${p.epoch}/${p.epochs}` +
              (p.loss != null ? ` · loss ${p.loss.toFixed(3)}` : "") +
              (p.acc != null ? ` · acc ${(p.acc * 100).toFixed(1)}%` : "")
          );
        },
      });
      const meta = {
        schemaVersion: 1 as const,
        classNames: [...classNames],
        inputFrames: DEFAULT_SEQUENCE_FRAMES,
        featureDimPerFrame: ML_FEATURES_PER_FRAME,
        trainedAt: new Date().toISOString(),
      };
      await saveCustomModelToBrowser(m, meta);
      m.dispose();
      await refreshFromStorage();
      setTrainLog(`Done. Model saved locally. Classes: ${classNames.join(", ")}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTrainLog(`Training failed: ${msg}`);
    } finally {
      setTraining(false);
    }
  }, [samples, classNames, refreshFromStorage]);

  const onClearModel = useCallback(async () => {
    setCustomPred(null);
    await clearStoredModel();
    setTrainLog("Cleared saved custom model.");
  }, [clearStoredModel]);

  const onClearSamples = useCallback(() => {
    if (samples.length === 0) return;
    if (!window.confirm("Delete all recorded custom samples?")) return;
    setSamples([]);
    clearSamplesStorage();
    setLastSaved(null);
    setTrainLog("Cleared samples.");
  }, [samples.length]);

  const labelCounts = useMemo(() => countCustomByLabel(samples), [samples]);

  const fpsFrames = useRef(0);
  const fpsLastT = useRef(0);
  const lastUiPush = useRef(0);

  const finalizeRecordingRef = useRef(finalizeRecording);
  finalizeRecordingRef.current = finalizeRecording;
  const failCaptureRef = useRef(failCapture);
  failCaptureRef.current = failCapture;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /** Snapshot for cleanup — same engine instance for this effect run. */
    const actionEngine = actionEngineRef.current;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        const detector = await createMoveNetMultiPoseDetector();
        if (cancelled) {
          detector.dispose();
          return;
        }
        detectorRef.current = detector;
        setDetectorStatus("ready");

        const tick = () => {
          if (cancelled) return;
          void (async () => {
            const det = detectorRef.current;
            const v = videoRef.current;
            const c = canvasRef.current;
            if (!det || !v || !c) return;

            if (v.readyState >= 2) {
              /** Canvas overlay: same-frame custom softmax (sidebar state may lag one frame). */
              let liveCustomPred: { label: string; confidence: number } | null = null;

              const cw = c.clientWidth;
              const ch = c.clientHeight;
              const dpr = Math.min(window.devicePixelRatio || 1, 2);
              const bw = Math.round(cw * dpr);
              const bh = Math.round(ch * dpr);
              if (c.width !== bw || c.height !== bh) {
                c.width = bw;
                c.height = bh;
              }

              const vw = v.videoWidth;
              const vh = v.videoHeight;
              const poses = await estimatePosesFromVideo(det, v, {
                maxPoses: 5,
                flipHorizontal: false,
              });
              const scale = Math.max(vw, vh);
              const tracked = trackerRef.current.update(poses, scale);
              lastTrackedRef.current = tracked;
              const frameTime = performance.now();

              const actionEvents = actionEngine.process(
                tracked,
                frameTime,
                scale,
                vh
              );
              const primary = selectPrimaryPlayer(tracked);
              if (primary && actionEvents.length) {
                const forP = actionEvents.filter((e) => e.playerId === primary.playerId);
                const last = forP[forP.length - 1];
                if (last) {
                  setBuiltinHint(formatActionLabel(last.action));
                }
              } else if (!primary) {
                setBuiltinHint(null);
              }

              if (phaseRef.current === "countdown") {
                const lock = lockedPlayerIdRef.current;
                const person = lock != null ? findPlayerById(tracked, lock) : undefined;
                const stable = person != null && isPoseStableEnough(person);
                if (stable) {
                  countdownBadStreakRef.current = 0;
                } else {
                  countdownBadStreakRef.current += 1;
                  if (countdownBadStreakRef.current > MAX_CONSECUTIVE_BAD_FRAMES) {
                    failCaptureRef.current("Countdown cancelled: pose lost.");
                  }
                }
              }

              if (phaseRef.current === "recording") {
                const lock = lockedPlayerIdRef.current;
                const elapsed = frameTime - recordingStartRef.current;
                if (elapsed >= RECORDING_DURATION_MS) {
                  finalizeRecordingRef.current();
                } else if (lock != null) {
                  const person = findPlayerById(tracked, lock);
                  if (person != null && isPoseStableEnough(person)) {
                    const frame = buildPoseFrameRecord(elapsed, person);
                    if (frame) {
                      framesBufferRef.current.push(frame);
                      badFrameStreakRef.current = 0;
                    } else {
                      badFrameStreakRef.current += 1;
                    }
                  } else {
                    badFrameStreakRef.current += 1;
                  }
                  if (badFrameStreakRef.current > MAX_CONSECUTIVE_BAD_FRAMES) {
                    failCaptureRef.current("Recording cancelled: pose lost.");
                  }
                  if (frameTime - lastRecordingUiPushRef.current > 120) {
                    lastRecordingUiPushRef.current = frameTime;
                    setRecordingElapsedMs(elapsed);
                    setRecordingFrameCount(framesBufferRef.current.length);
                  }
                }
              }

              const ok = primary != null && isPoseStableEnough(primary);
              if (primary && ok) {
                const fr = buildPoseFrameRecord(frameTime, primary);
                if (fr) {
                  const buf = liveFrameBufferRef.current;
                  buf.push(fr);
                  while (buf.length > LIVE_BUFFER_MAX) buf.shift();

                  const m = inferModelRef.current;
                  const meta = inferMetaRef.current;
                  if (m && meta && buf.length >= DEFAULT_SEQUENCE_FRAMES) {
                    const pred = predictCustomSequence(m, meta.classNames, buf, meta.inputFrames);
                    liveCustomPred = { label: pred.label, confidence: pred.confidence };
                    setCustomPred({ label: pred.label, confidence: pred.confidence });
                  }
                }
              } else {
                setCustomPred(null);
              }

              ctx.clearRect(0, 0, c.width, c.height);
              ctx.save();
              ctx.scale(dpr, dpr);

              const drawTarget =
                phaseRef.current === "recording" || phaseRef.current === "countdown"
                  ? lockedPlayerIdRef.current != null
                    ? findPlayerById(tracked, lockedPlayerIdRef.current) ?? primary
                    : primary
                  : primary;

              if (drawTarget) {
                drawSinglePerson(
                  ctx,
                  drawTarget,
                  vw,
                  vh,
                  cw,
                  ch,
                  KEYPOINT_CONFIDENCE_THRESHOLD,
                  0.15
                );
                const stroke = playerHue(drawTarget.playerId);
                const torsoPx = mapVideoToMirroredOverlay(
                  drawTarget.torso.x,
                  drawTarget.torso.y,
                  vw,
                  vh,
                  cw,
                  ch
                );
                const ephem = actionEngine.getEphemeralForCanvas(frameTime, [drawTarget.playerId]);
                const builtinFlash = ephem[0]?.action ?? null;
                const recordingLabelNorm =
                  phaseRef.current === "recording"
                    ? normalizeLabel(lockedLabelRef.current)
                    : null;
                const countdownTargetNorm =
                  phaseRef.current === "countdown"
                    ? normalizeLabel(lockedLabelRef.current)
                    : null;
                const trainerLines = buildTrainerTorsoLines({
                  builtinAction: builtinFlash,
                  custom: liveCustomPred,
                  phase: phaseRef.current,
                  recordingLabel: recordingLabelNorm,
                  countdownTargetLabel: countdownTargetNorm,
                });
                drawTorsoActionLabels(ctx, torsoPx.x, torsoPx.y, trainerLines, stroke);
              }
              ctx.restore();

              fpsFrames.current += 1;
              const now = performance.now();
              if (now - fpsLastT.current >= 500) {
                const elapsedSec = (now - fpsLastT.current) / 1000;
                setFps(Math.round(fpsFrames.current / elapsedSec));
                fpsFrames.current = 0;
                fpsLastT.current = now;
              }

              if (now - lastUiPush.current > 180) {
                lastUiPush.current = now;
                setPoseOk(ok);
                setPeopleCount(tracked.length);
              }
            }
          })().finally(() => {
            if (!cancelled) rafRef.current = requestAnimationFrame(tick);
          });
        };

        fpsLastT.current = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera or model failed";
        setDetectorStatus("error");
        setDetectorError(msg);
      }
    };

    void start();

    return () => {
      cancelled = true;
      clearCountdownTimers();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.dispose();
      detectorRef.current = null;
      actionEngine.reset();
      trackerRef.current = new TorsoProximityTracker();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      liveFrameBufferRef.current = [];
    };
  }, [clearCountdownTimers]);

  const busy = phase !== "idle";
  const totalSamples = samples.length;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-3 py-6 sm:px-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <header>
          <p className="text-sm text-[var(--muted)]">TensorFlow.js · separate from gameplay scoring</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Custom Action Training
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Define labels, record sequences, train a small classifier in the browser, and preview live
            predictions. Built-in rhythm game moves ({DANCE_ACTION_IDS.join(", ")}) stay rule-based and are
            not trained here.
          </p>
        </header>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 p-3 shadow-inner sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Camera</h2>
            <span className="text-[10px] text-[var(--muted)]">
              {detectorStatus === "ready" ? `MoveNet · ${fps} fps · ${peopleCount} people` : detectorStatus}
            </span>
          </div>

          <div className="relative w-full overflow-hidden rounded-xl bg-black shadow-lg">
            <video
              ref={videoRef}
              className="block h-auto w-full scale-x-[-1] transform object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
            {detectorStatus === "loading" ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-sm text-white">
                Loading pose model…
              </div>
            ) : null}
            {detectorStatus === "error" ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-amber-100">
                {detectorError ?? "Camera error"}
              </div>
            ) : null}

            {phase === "countdown" && countdownNum != null ? (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35">
                <div className="text-7xl font-black tabular-nums text-white drop-shadow-lg sm:text-8xl">
                  {countdownNum}
                </div>
              </div>
            ) : null}

            {phase === "recording" ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
                <div className="rounded-full border border-rose-500/60 bg-rose-600/85 px-4 py-1.5 text-sm font-semibold uppercase tracking-widest text-white shadow-lg">
                  Recording sample…
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
            <div
              className={
                poseOk
                  ? "rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-200"
                  : "rounded-md bg-rose-500/15 px-2 py-1 text-rose-200"
              }
            >
              Pose: {poseOk ? "OK to capture" : "Need stable shoulders + hips"}
            </div>
            <div className="rounded-md border border-[var(--border)] bg-black/25 px-2 py-1 text-[var(--muted)]">
              <span className="text-[var(--muted)]">Built-in (rule) hint: </span>
              <span className="font-semibold text-cyan-200">{builtinHint ?? "—"}</span>
            </div>
            <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 sm:col-span-2">
              <span className="text-[var(--muted)]">Custom model live: </span>
              {customPred ? (
                <span className="font-semibold text-fuchsia-100">
                  {customPred.label}{" "}
                  <span className="text-[var(--muted)]">({Math.round(customPred.confidence * 100)}%)</span>
                </span>
              ) : (
                <span className="text-[var(--muted)]">
                  {ctxMetadata ? "Collecting frames…" : "Train or load a model first"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:max-w-md">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/40 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Built-in default actions (read-only)
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Recognized by fixed rules on the main stage — not by this trainer.
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-cyan-200/90">
            {DANCE_ACTION_IDS.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/40 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Custom classes
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            “{CUSTOM_IDLE_LABEL}” is always included. Add your own labels (letters, numbers, underscores).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={newClassInput}
              onChange={(e) => setNewClassInput(e.target.value)}
              placeholder="e.g. point_left"
              className="min-w-[160px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-xs text-[var(--text)]"
            />
            <button
              type="button"
              onClick={addCustomClass}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100"
            >
              Add class
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            <li className="flex justify-between gap-2 text-[var(--muted)]">
              <span className="font-mono text-emerald-200/90">{CUSTOM_IDLE_LABEL}</span>
              <span>{labelCounts[CUSTOM_IDLE_LABEL] ?? 0} samples</span>
            </li>
            {userCustomClasses.map((c) => (
              <li key={c} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[var(--text)]">{c}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">{labelCounts[c] ?? 0}</span>
                  <button
                    type="button"
                    onClick={() => deleteCustomClass(c)}
                    className="rounded border border-rose-500/35 px-2 py-0.5 text-[10px] text-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/40 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Record sample
          </h3>
          <select
            value={recordLabel}
            onChange={(e) => setRecordLabel(e.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 font-mono text-xs text-[var(--text)]"
          >
            {classNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {phase === "recording" ? (
            <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">
              {Math.min(100, Math.round((recordingElapsedMs / RECORDING_DURATION_MS) * 100))}% · frames{" "}
              {recordingFrameCount}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy || detectorStatus !== "ready" || classNames.length < 2}
            onClick={startCountdown}
            className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-600/25 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/35 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Record sample
          </button>
          {statusMessage ? (
            <p className="mt-2 text-xs text-amber-200" role="status">
              {statusMessage}
            </p>
          ) : null}
          {lastSaved ? (
            <p className="mt-2 text-xs text-emerald-200" role="status">
              {lastSaved}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/40 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Train & model
          </h3>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Total samples: {totalSamples}. Sequence length: {DEFAULT_SEQUENCE_FRAMES} frames (resampled).
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={training || classNames.length < 2}
              onClick={onTrain}
              className="rounded-lg border border-violet-500/45 bg-violet-600/25 px-3 py-2 text-xs font-bold uppercase tracking-wide text-violet-100 hover:bg-violet-600/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {training ? "Training…" : "Train model"}
            </button>
            <button
              type="button"
              onClick={onClearSamples}
              disabled={totalSamples === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--border)]/30 disabled:opacity-40"
            >
              Clear all samples
            </button>
            <button
              type="button"
              onClick={onClearModel}
              disabled={!ctxMetadata}
              className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 disabled:opacity-40"
            >
              Clear saved model
            </button>
          </div>
          {trainLog ? (
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-black/30 p-2 font-mono text-[10px] text-[var(--muted)]">
              {trainLog}
            </pre>
          ) : null}
          {ctxMetadata ? (
            <p className="mt-2 text-[10px] text-[var(--muted)]">
              Last trained: {ctxMetadata.trainedAt} · classes {ctxMetadata.classNames.join(", ")}
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
