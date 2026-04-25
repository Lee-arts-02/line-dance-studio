"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PoseDetector } from "@tensorflow-models/pose-detection";
import { useCustomModel } from "@/context/CustomModelContext";
import type { AudioEngine } from "@/lib/audio/audioEngine";
import {
  beatFloatToPairIndex,
  getBeatSlotForGlobalBeat,
  type LateralMappingMode,
  mapDetectedDefaultActionForGameplay,
  type BeatSlot,
  type DanceActionId,
} from "@/lib/dance/sequence";
import { GroupSyncTracker, STATS_INTERVAL_BEATS } from "@/lib/game/groupSync";
import { judgePlayerAction } from "@/lib/game/judgment";
import { PlayerScoreboard, isJudgmentVisible } from "@/lib/game/scoring";
import {
  createNeutralRewardState,
  type RewardVisualState,
} from "@/lib/game/rewards";
import type {
  GroupSyncBeatResult,
  GroupSyncIntervalReport,
  PlayerActionEvent,
} from "@/lib/game/types";
import { ComboDisplay } from "@/components/ComboDisplay";
import { PerformanceScreenFlash } from "@/components/PerformanceScreenFlash";
import { PerformanceSummaryOverlay } from "@/components/PerformanceSummaryOverlay";
import { TeamFlowBar } from "@/components/TeamFlowBar";
import { RewardOverlays } from "@/components/RewardOverlays";
import type { CameraStagePerformanceMetrics } from "@/hooks/usePerformanceMetrics";
import {
  createMoveNetMultiPoseDetector,
  estimatePosesFromVideo,
} from "@/lib/pose/detector";
import { COCO17_EDGES, playerHue, shouldDrawEdge } from "@/lib/pose/skeleton";
import {
  buildMainStageTorsoLines,
  drawTorsoActionLabels,
  TORSO_ACTION_LABEL_LINE_GAP_PX,
  type CustomBodyPrediction,
} from "@/lib/pose/bodyActionLabels";
import { mapVideoToDisplay, mapVideoToMirroredOverlay } from "@/lib/pose/mirroredVideoMap";
import {
  ActionRecognitionEngine,
  formatActionLabel,
  type EphemeralActionDisplay,
} from "@/lib/pose/actions";
import { TorsoProximityTracker } from "@/lib/pose/tracker";
import {
  KEYPOINT_CONFIDENCE_THRESHOLD,
  type StablePlayerId,
  type TrackedPerson,
} from "@/lib/pose/types";
import { predictCustomSequence } from "@/lib/ml/inference";
import { CustomGestureEmitter } from "@/lib/ml/customGestureEmitter";
import {
  buildPoseFrameRecord,
  isPoseStableEnough,
  selectPrimaryPlayer,
} from "@/lib/ml/recording";
import { DEFAULT_SEQUENCE_FRAMES } from "@/lib/ml/training";
import type { PoseFrameRecord } from "@/lib/ml/types";

type DetectorUiStatus = "loading" | "ready" | "error";

type ActionDebugRow = {
  playerId: number;
  lastAction: string | null;
  lastTimeMs: number | null;
  judgment: string | null;
  score: number;
  combo: number;
};

type JudgmentCanvasOverlay = {
  playerId: StablePlayerId;
  text: string;
  tier: "perfect" | "good" | "miss";
};

type PoseDebugSnapshot = {
  status: DetectorUiStatus;
  errorMessage?: string;
  numDetected: number;
  playerLabels: string[];
  fps: number;
  actionRows: ActionDebugRow[];
  /** Latest softmax preview from the global custom model (primary player). */
  customLive: { label: string; confidence: number } | null;
  /** True when context has a loaded TF.js LayersModel (not only metadata). */
  customModelLoaded: boolean;
  /** True when we ran predictCustomSequence this frame window (model + enough stable frames). */
  customInferenceRunning: boolean;
  /** Primary player present and pose passes the same stability gate as Custom Action Training. */
  customPoseInputOk: boolean;
};

type GroupSyncPanelState = {
  /** Last action+rest pair that finished team evaluation. */
  lastResult: GroupSyncBeatResult | null;
  /** Last emitted interval summary (e.g. 1-minute window). */
  lastIntervalReport: GroupSyncIntervalReport | null;
  /** Global pair index — throttled for React. */
  currentBlockIndex: number;
  currentExpectedLabel: string;
};

function mapEphemeralForGameplayDisplay(
  rows: EphemeralActionDisplay[],
  lateralMode: LateralMappingMode
): EphemeralActionDisplay[] {
  return rows.map((e) => ({
    playerId: e.playerId,
    action:
      e.action == null
        ? null
        : (mapDetectedDefaultActionForGameplay(e.action, lateralMode) as DanceActionId),
  }));
}

function judgmentFillForTier(tier: JudgmentCanvasOverlay["tier"]): string {
  switch (tier) {
    case "perfect":
      return "rgba(74,222,128,0.98)";
    case "good":
      return "rgba(251,191,36,0.95)";
    default:
      return "rgba(248,113,113,0.55)";
  }
}

function drawTrackedPoses(
  ctx: CanvasRenderingContext2D,
  people: TrackedPerson[],
  ephemeral: EphemeralActionDisplay[],
  customBody: CustomBodyPrediction | null,
  judgmentOverlays: JudgmentCanvasOverlay[],
  vw: number,
  vh: number,
  cw: number,
  ch: number,
  mirrorCamera: boolean,
  conf: number,
  loose: number
) {
  for (const person of people) {
    const stroke = playerHue(person.playerId);
    const fill = stroke;

    for (const [i, j] of COCO17_EDGES) {
      const a = person.keypoints[i];
      const b = person.keypoints[j];
      if (!a || !b) continue;
      if (!shouldDrawEdge(a.score, b.score, i, j, conf, loose)) continue;
      const mapper = mirrorCamera ? mapVideoToMirroredOverlay : mapVideoToDisplay;
      const p1 = mapper(a.x, a.y, vw, vh, cw, ch);
      const p2 = mapper(b.x, b.y, vw, vh, cw, ch);
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
      const mapper = mirrorCamera ? mapVideoToMirroredOverlay : mapVideoToDisplay;
      const p = mapper(kp.x, kp.y, vw, vh, cw, ch);
      ctx.fillStyle = fill;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const mapper = mirrorCamera ? mapVideoToMirroredOverlay : mapVideoToDisplay;
    const t = mapper(person.torso.x, person.torso.y, vw, vh, cw, ch);
    const snap = ephemeral.find((s) => s.playerId === person.playerId);
    const torsoLines = buildMainStageTorsoLines(snap, customBody, person.playerId);
    /** Extra action lines stack upward — nudge player / judgment labels to avoid overlap. */
    const stackLift =
      Math.max(0, torsoLines.length - 1) * TORSO_ACTION_LABEL_LINE_GAP_PX;

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.fillStyle = stroke;
    ctx.font = "bold 14px system-ui, sans-serif";
    const label = `Player ${person.playerId}`;
    ctx.strokeText(label, t.x, t.y - 28 - stackLift);
    ctx.fillText(label, t.x, t.y - 28 - stackLift);

    const j = judgmentOverlays.find((o) => o.playerId === person.playerId);
    if (j) {
      ctx.font =
        j.tier === "perfect"
          ? "800 13px system-ui, sans-serif"
          : j.tier === "good"
            ? "700 12px system-ui, sans-serif"
            : "600 11px system-ui, sans-serif";
      ctx.lineWidth = j.tier === "perfect" ? 4 : 3;
      ctx.fillStyle = judgmentFillForTier(j.tier);
      ctx.strokeStyle = "rgba(0,0,0,0.72)";
      ctx.strokeText(j.text, t.x, t.y - 46 - stackLift);
      ctx.fillText(j.text, t.x, t.y - 46 - stackLift);
    }

    drawTorsoActionLabels(ctx, t.x, t.y, torsoLines, stroke);
  }
}

function formatJudgmentLabel(kind: "perfect" | "good" | "miss"): string {
  switch (kind) {
    case "perfect":
      return "PERFECT";
    case "good":
      return "GOOD";
    default:
      return "MISS";
  }
}

function groupSyncStatusClass(label: GroupSyncBeatResult["statusLabel"]): string {
  switch (label) {
    case "tight":
      return "text-emerald-300";
    case "good":
      return "text-amber-300";
    default:
      return "text-rose-300/90";
  }
}

function formatGroupSyncStatusWord(label: GroupSyncBeatResult["statusLabel"]): string {
  switch (label) {
    case "tight":
      return "Tight";
    case "good":
      return "Good";
    default:
      return "Loose";
  }
}

export type CameraStageProps = {
  engineRef: RefObject<AudioEngine | null>;
  /** Step 7: minimal chrome + reward overlays */
  performanceMode?: boolean;
  /** Fires once per finalized group-sync beat (same as Step 6 tracker). */
  onGroupSyncFinalized?: (result: GroupSyncBeatResult) => void;
  /** Fires when the rolling stats interval closes (every 16 beats in tracker). */
  onGroupStatsInterval?: (report: GroupSyncIntervalReport) => void;
  rewardVisual?: RewardVisualState;
  confettiBurstKey?: number;
  /** Active choreography (action + rest beats); must match HUD / timeline. */
  choreographySequence: readonly BeatSlot[];
  /** Live BPM for team-flow pulse timing in performance mode. */
  performanceBpm?: number;
  /** Cumulative session HUD + ingest (owned by parent with PLAY / END). */
  performanceMetrics?: CameraStagePerformanceMetrics | null;
  /** Increments on each PLAY — resets in-stage scoring / group-sync for a new performance round. */
  performanceSessionGeneration?: number;
  /**
   * Performance only: beats per cue / stats roll-up, aligned to phrase boundaries (e.g. `2 *` one
   * full `choreographySequence.length` for two right–right–left–clap rounds).
   */
  performanceCueEveryBeats?: number;
  mirrorCamera?: boolean;
  lateralMode?: LateralMappingMode;
};

/**
 * Live camera + MoveNet MultiPose + canvas overlay. Detection runs in rAF; React state is throttled.
 */
export function CameraStage({
  engineRef,
  performanceMode = false,
  onGroupSyncFinalized,
  onGroupStatsInterval,
  rewardVisual = createNeutralRewardState(),
  confettiBurstKey = 0,
  choreographySequence,
  performanceBpm,
  performanceMetrics = null,
  performanceSessionGeneration = 0,
  performanceCueEveryBeats,
  mirrorCamera = true,
  lateralMode = "front",
}: CameraStageProps) {
  const onGroupSyncRef = useRef(onGroupSyncFinalized);
  onGroupSyncRef.current = onGroupSyncFinalized;
  const onGroupStatsIntervalRef = useRef(onGroupStatsInterval);
  onGroupStatsIntervalRef.current = onGroupStatsInterval;
  const choreographyRef = useRef(choreographySequence);
  choreographyRef.current = choreographySequence;
  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;
  const performanceCueEveryBeatsRef = useRef(performanceCueEveryBeats ?? 0);
  performanceCueEveryBeatsRef.current = performanceCueEveryBeats ?? 0;
  const mirrorCameraRef = useRef(mirrorCamera);
  mirrorCameraRef.current = mirrorCamera;
  const lateralModeRef = useRef<LateralMappingMode>(lateralMode);
  lateralModeRef.current = lateralMode;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const trackerRef = useRef(new TorsoProximityTracker());
  const actionEngineRef = useRef(new ActionRecognitionEngine(14));
  const scoreboardRef = useRef(new PlayerScoreboard());
  const groupSyncRef = useRef(new GroupSyncTracker());
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const lastDebugPush = useRef(0);
  const lastCustomUiPush = useRef(0);
  const lastGroupUiPush = useRef(0);
  const fpsFrames = useRef(0);
  const fpsLastT = useRef(0);
  const fpsValue = useRef(0);

  const [debug, setDebug] = useState<PoseDebugSnapshot>({
    status: "loading",
    numDetected: 0,
    playerLabels: [],
    fps: 0,
    actionRows: [],
    customLive: null,
    customModelLoaded: false,
    customInferenceRunning: false,
    customPoseInputOk: false,
  });

  const { model: customModel, metadata: customMeta, hasLoadedModel } = useCustomModel();
  const customModelRef = useRef(customModel);
  const customMetaRef = useRef(customMeta);
  useEffect(() => {
    customModelRef.current = customModel;
    customMetaRef.current = customMeta;
  }, [customModel, customMeta]);

  const loggedCustomReadyRef = useRef(false);
  useEffect(() => {
    if (customModel && customMeta && hasLoadedModel) {
      if (!loggedCustomReadyRef.current) {
        loggedCustomReadyRef.current = true;
        console.info("[CameraStage] Custom TF model ready for live inference.", {
          classes: customMeta.classNames,
          inputFrames: customMeta.inputFrames,
        });
      }
    } else {
      loggedCustomReadyRef.current = false;
    }
  }, [customModel, customMeta, hasLoadedModel]);

  const liveFramesRef = useRef<PoseFrameRecord[]>([]);
  const customEmitterRef = useRef(new CustomGestureEmitter());
  const lastAppliedPerfGenRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!performanceMode) {
      lastAppliedPerfGenRef.current = null;
      return;
    }
    if (performanceSessionGeneration <= 0) return;
    if (lastAppliedPerfGenRef.current === performanceSessionGeneration) return;
    lastAppliedPerfGenRef.current = performanceSessionGeneration;

    scoreboardRef.current.reset();
    groupSyncRef.current.reset();
    actionEngineRef.current.reset();
    customEmitterRef.current.reset();
    liveFramesRef.current.length = 0;
  }, [performanceMode, performanceSessionGeneration]);

  const [groupSyncPanel, setGroupSyncPanel] = useState<GroupSyncPanelState>({
    lastResult: null,
    lastIntervalReport: null,
    currentBlockIndex: 0,
    currentExpectedLabel: "—",
  });

  const ingestPerfSummaryRef = useRef<(r: GroupSyncIntervalReport) => void>(() => {});
  const ingestBlockRef = useRef<(r: GroupSyncBeatResult) => void>(() => {});
  useEffect(() => {
    ingestPerfSummaryRef.current = performanceMetrics?.ingestIntervalReport ?? (() => {});
    ingestBlockRef.current = performanceMetrics?.ingestBlockResult ?? (() => {});
  }, [performanceMetrics?.ingestIntervalReport, performanceMetrics?.ingestBlockResult]);

  useEffect(() => {
    const beats =
      performanceMode &&
      performanceCueEveryBeats != null &&
      performanceCueEveryBeats > 0
        ? performanceCueEveryBeats
        : STATS_INTERVAL_BEATS;
    groupSyncRef.current.setStatsIntervalBeats(beats);
  }, [performanceMode, performanceCueEveryBeats]);
  const pushDebug = useCallback((partial: Partial<PoseDebugSnapshot>) => {
    const now = performance.now();
    if (now - lastDebugPush.current < 220) return;
    lastDebugPush.current = now;
    setDebug((d) => ({ ...d, ...partial }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const liveBufRef = liveFramesRef;
    const customEmitter = customEmitterRef.current;

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
        pushDebug({ status: "ready" });

        const tick = () => {
          if (cancelled) return;
          void (async () => {
            const det = detectorRef.current;
            const v = videoRef.current;
            const c = canvasRef.current;
            if (!det || !v || !c) return;

            if (v.readyState >= 2) {
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
              const frameTime = performance.now();
              const actionEvents = actionEngineRef.current.process(
                tracked,
                frameTime,
                scale,
                vh
              );
              const engine = engineRef.current;
              let scoreUpdated = false;
              if (engine && actionEvents.length > 0) {
                const audioTimeSec = engine.getCurrentTime();
                const bpm = engine.getBpm();
                for (const ev of actionEvents) {
                  const payload: PlayerActionEvent = {
                    playerId: ev.playerId,
                    action: mapDetectedDefaultActionForGameplay(ev.action, lateralModeRef.current),
                    detectionSource: "default_rules",
                    tPerf: ev.t,
                    audioTimeSec,
                  };
                  const result = judgePlayerAction(payload, bpm, choreographyRef.current);
                  if (result === null) continue;
                  if (scoreboardRef.current.applyJudgment(ev.playerId, result, frameTime)) {
                    scoreUpdated = true;
                    groupSyncRef.current.recordAppliedJudgment(
                      Math.floor(result.targetBeatIndex / 2),
                      ev.playerId,
                      result,
                      audioTimeSec
                    );
                  }
                }
              }

              /**
               * Custom TF.js sequence classifier — NOT gated on the audio engine.
               * Preview + softmax run whenever the model is loaded; scoring / gesture emit need `engine`
               * for beat alignment. Frame gating matches `CustomActionTrainer`: only append frames when
               * `isPoseStableEnough` so preprocessing matches training data.
               */
              const mdl = customModelRef.current;
              const meta = customMetaRef.current;
              const primary = selectPrimaryPlayer(tracked);
              const buf = liveFramesRef.current;
              const poseOkForCustom = primary != null && isPoseStableEnough(primary);
              let customInferenceRan = false;
              /** Same-frame softmax for on-body label (primary player only). */
              let customBodyForCanvas: CustomBodyPrediction | null = null;

              if (!mdl || !meta) {
                buf.length = 0;
                if (frameTime - lastCustomUiPush.current >= 220) {
                  lastCustomUiPush.current = frameTime;
                  setDebug((d) => ({
                    ...d,
                    customLive: null,
                    customModelLoaded: false,
                    customInferenceRunning: false,
                    customPoseInputOk: false,
                  }));
                }
              } else if (!primary) {
                buf.length = 0;
                if (frameTime - lastCustomUiPush.current >= 220) {
                  lastCustomUiPush.current = frameTime;
                  setDebug((d) => ({
                    ...d,
                    customLive: null,
                    customModelLoaded: true,
                    customInferenceRunning: false,
                    customPoseInputOk: false,
                  }));
                }
              } else if (!poseOkForCustom) {
                if (frameTime - lastCustomUiPush.current >= 220) {
                  lastCustomUiPush.current = frameTime;
                  setDebug((d) => ({
                    ...d,
                    customLive: null,
                    customModelLoaded: true,
                    customInferenceRunning: false,
                    customPoseInputOk: false,
                  }));
                }
              } else {
                const fr = buildPoseFrameRecord(frameTime, primary);
                if (fr) {
                  buf.push(fr);
                  while (buf.length > 48) buf.shift();
                  if (buf.length >= DEFAULT_SEQUENCE_FRAMES) {
                    const pred = predictCustomSequence(
                      mdl,
                      meta.classNames,
                      buf,
                      meta.inputFrames
                    );
                    customInferenceRan = true;
                    customBodyForCanvas = {
                      playerId: primary.playerId,
                      label: pred.label,
                      confidence: pred.confidence,
                    };
                    if (frameTime - lastCustomUiPush.current >= 200) {
                      lastCustomUiPush.current = frameTime;
                      setDebug((d) => ({
                        ...d,
                        customLive: { label: pred.label, confidence: pred.confidence },
                        customModelLoaded: true,
                        customInferenceRunning: true,
                        customPoseInputOk: true,
                      }));
                    }
                    if (engine) {
                      const emitted = customEmitterRef.current.tryEmit(
                        primary.playerId,
                        pred.label,
                        pred.confidence,
                        frameTime
                      );
                      if (emitted) {
                        const audioTimeSec = engine.getCurrentTime();
                        const bpm = engine.getBpm();
                        const payload: PlayerActionEvent = {
                          playerId: primary.playerId,
                          action: emitted,
                          detectionSource: "custom_model",
                          tPerf: frameTime,
                          audioTimeSec,
                        };
                        const result = judgePlayerAction(
                          payload,
                          bpm,
                          choreographyRef.current
                        );
                        if (result !== null) {
                          if (
                            scoreboardRef.current.applyJudgment(
                              primary.playerId,
                              result,
                              frameTime
                            )
                          ) {
                            scoreUpdated = true;
                            groupSyncRef.current.recordAppliedJudgment(
                              Math.floor(result.targetBeatIndex / 2),
                              primary.playerId,
                              result,
                              audioTimeSec
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (engine) {
                const audioTimeSec = engine.getCurrentTime();
                const bf = engine.getCurrentBeatFloat();
                const alignLoopBeats =
                  performanceModeRef.current &&
                  performanceCueEveryBeatsRef.current > 0
                    ? performanceCueEveryBeatsRef.current
                    : 0;
                const tickOut = groupSyncRef.current.tick(
                  bf,
                  audioTimeSec,
                  tracked.map((p) => p.playerId),
                  choreographyRef.current,
                  {
                    intervalFlushAlignLoopBeats: alignLoopBeats,
                    pairFinalizeEarlyBeats: performanceModeRef.current ? 1 : 0,
                  }
                );
                if (tickOut.latestBlockResult) {
                  setGroupSyncPanel((p) => ({ ...p, lastResult: tickOut.latestBlockResult }));
                  onGroupSyncRef.current?.(tickOut.latestBlockResult);
                  ingestBlockRef.current(tickOut.latestBlockResult);
                }
                if (tickOut.intervalReports.length > 0) {
                  const latestReport = tickOut.intervalReports[tickOut.intervalReports.length - 1]!;
                  setGroupSyncPanel((p) => ({ ...p, lastIntervalReport: latestReport }));
                  ingestPerfSummaryRef.current(latestReport);
                  for (const report of tickOut.intervalReports) {
                    onGroupStatsIntervalRef.current?.(report);
                  }
                }
                const nowUi = performance.now();
                if (nowUi - lastGroupUiPush.current >= 200) {
                  lastGroupUiPush.current = nowUi;
                  const beatIdx = Math.floor(bf);
                  const slot = getBeatSlotForGlobalBeat(beatIdx, choreographyRef.current);
                  const label = slot.kind === "action" ? slot.displayLabel : "PREP";
                  setGroupSyncPanel((p) => ({
                    ...p,
                    currentBlockIndex: beatFloatToPairIndex(bf),
                    currentExpectedLabel: label,
                  }));
                }
              }
              const actionEphemeral = mapEphemeralForGameplayDisplay(
                actionEngineRef.current.getEphemeralForCanvas(
                  frameTime,
                  tracked.map((p) => p.playerId)
                ),
                lateralModeRef.current
              );
              const actionSnapshots = actionEngineRef.current.getSnapshotsForPlayers(
                tracked.map((p) => p.playerId)
              );

              const actionRowsFromSnapshots = (): ActionDebugRow[] =>
                actionSnapshots.map((s) => {
                  const st = scoreboardRef.current.get(s.playerId);
                  const displayAction =
                    s.lastAction == null
                      ? null
                      : (mapDetectedDefaultActionForGameplay(
                          s.lastAction,
                          lateralModeRef.current
                        ) as DanceActionId);
                  return {
                    playerId: s.playerId,
                    lastAction: displayAction ? formatActionLabel(displayAction) : null,
                    lastTimeMs: s.lastActionTime,
                    judgment: st.latestJudgment ? formatJudgmentLabel(st.latestJudgment) : null,
                    score: st.totalScore,
                    combo: st.combo,
                  };
                });

              if (scoreUpdated) {
                setDebug((d) => ({ ...d, actionRows: actionRowsFromSnapshots() }));
              }

              const judgmentOverlays: JudgmentCanvasOverlay[] = tracked
                .map((p) => {
                  const st = scoreboardRef.current.get(p.playerId);
                  if (!st.latestJudgment || !isJudgmentVisible(st, frameTime)) return null;
                  const o: JudgmentCanvasOverlay = {
                    playerId: p.playerId,
                    text: formatJudgmentLabel(st.latestJudgment),
                    tier: st.latestJudgment,
                  };
                  return o;
                })
                .filter((x): x is JudgmentCanvasOverlay => x != null);

              ctx.clearRect(0, 0, c.width, c.height);
              ctx.save();
              ctx.scale(dpr, dpr);
              drawTrackedPoses(
                ctx,
                tracked,
                actionEphemeral,
                customBodyForCanvas,
                judgmentOverlays,
                vw,
                vh,
                cw,
                ch,
                mirrorCameraRef.current,
                KEYPOINT_CONFIDENCE_THRESHOLD,
                0.15
              );
              ctx.restore();

              fpsFrames.current += 1;
              const now = performance.now();
              if (now - fpsLastT.current >= 500) {
                const elapsed = (now - fpsLastT.current) / 1000;
                fpsValue.current = Math.round(fpsFrames.current / elapsed);
                fpsFrames.current = 0;
                fpsLastT.current = now;
              }

              pushDebug({
                numDetected: poses.length,
                playerLabels: tracked.map((p) => `Player ${p.playerId}`),
                fps: fpsValue.current,
                actionRows: actionRowsFromSnapshots(),
                customModelLoaded: !!(customModelRef.current && customMetaRef.current),
                customInferenceRunning: customInferenceRan,
                customPoseInputOk: poseOkForCustom && primary != null,
              });
            }
          })().finally(() => {
            if (!cancelled) rafRef.current = requestAnimationFrame(tick);
          });
        };

        fpsLastT.current = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera or model failed";
        pushDebug({ status: "error", errorMessage: msg });
      }
    };

    void start();

    const tracker = trackerRef.current;
    const actions = actionEngineRef.current;
    const scoreboard = scoreboardRef.current;
    const groupSync = groupSyncRef.current;

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.dispose();
      detectorRef.current = null;
      tracker.reset();
      actions.reset();
      scoreboard.reset();
      groupSync.reset();
      liveBufRef.current.length = 0;
      customEmitter.reset();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [pushDebug, engineRef]);

  const stageShell = performanceMode
    ? "flex min-h-0 w-full flex-1 flex-col"
    : "flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 p-3 shadow-inner sm:p-4";

  const videoWrapClass = performanceMode
    ? "relative w-full min-h-0 flex-1 overflow-hidden rounded-none bg-black"
    : "relative w-full overflow-hidden rounded-xl bg-black shadow-lg";

  return (
    <section className={stageShell} aria-label="Live camera and pose overlay">
      {!performanceMode ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Stage</h2>
          <span className="text-[10px] text-[var(--muted)]">MoveNet MultiPose · local only</span>
        </div>
      ) : null}

      <div className={videoWrapClass}>
        {/* Mirror video only; skeleton uses mirrored math on an unmirrored canvas so labels stay readable. */}
        <video
          ref={videoRef}
          className={
            performanceMode
              ? `block h-full min-h-[240px] w-full flex-1 transform object-cover ${
                  mirrorCamera ? "scale-x-[-1]" : ""
                }`
              : `block h-auto w-full transform object-cover ${mirrorCamera ? "scale-x-[-1]" : ""}`
          }
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />
        <RewardOverlays
          reward={rewardVisual}
          confettiBurstKey={confettiBurstKey}
          performanceConfettiKey={performanceMode && performanceMetrics ? performanceMetrics.gameHud.flowConfettiKey : 0}
        />
        {performanceMode && performanceMetrics ? (
          <>
            <ComboDisplay
              syncCount={performanceMetrics.gameHud.syncCount}
              correctCount={performanceMetrics.gameHud.correctCount}
              syncPulseTick={performanceMetrics.gameHud.syncPulseTick}
              correctPulseTick={performanceMetrics.gameHud.correctPulseTick}
              micro={performanceMetrics.gameHud.micro}
            />
            <TeamFlowBar teamFlow={performanceMetrics.gameHud.teamFlow} bpm={performanceBpm} />
            <PerformanceScreenFlash flashKey={performanceMetrics.gameHud.flowScreenFlashKey} />
          </>
        ) : null}
        {performanceMode && performanceMetrics?.cycle ? (
          <PerformanceSummaryOverlay
            key={performanceMetrics.cycle.key}
            stats={performanceMetrics.cycle.stats}
            onDismiss={performanceMetrics.dismissCycle}
          />
        ) : null}
        {debug.status === "loading" ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-sm text-white">
            Loading pose model…
          </div>
        ) : null}
        {debug.status === "error" ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-amber-100">
            {debug.errorMessage ?? "Camera error"}
          </div>
        ) : null}
        {!performanceMode ? (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-25 max-w-full rounded-lg border border-fuchsia-500/25 bg-black/60 px-2.5 py-1.5 text-[10px] text-fuchsia-100/95 backdrop-blur-sm sm:text-[11px]">
            <span className="font-semibold text-white/55">Custom · </span>
            {hasLoadedModel ? (
              debug.customLive ? (
                <>
                  {debug.customLive.label}
                  <span className="text-white/45">
                    {" "}
                    ({Math.round(debug.customLive.confidence * 100)}%)
                  </span>
                </>
              ) : (
                <span className="text-white/40">collecting pose frames…</span>
              )
            ) : (
              <span className="text-white/40">no model — use Custom Action Training to train</span>
            )}
          </div>
        ) : null}
      </div>

      {!performanceMode ? (
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Group sync
          </h3>
          <span className="text-[10px] text-[var(--muted)]">per move+prep · team</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[10px] sm:grid-cols-3">
          <div>
            <span className="text-[var(--muted)]">current pair</span>
            <div className="text-cyan-200/90">{groupSyncPanel.currentBlockIndex}</div>
          </div>
          <div>
            <span className="text-[var(--muted)]">expected</span>
            <div className="text-amber-200/90">{groupSyncPanel.currentExpectedLabel}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[var(--muted)]">status</span>
            <div
              className={
                groupSyncPanel.lastResult
                  ? groupSyncStatusClass(groupSyncPanel.lastResult.statusLabel)
                  : "text-[var(--muted)]"
              }
            >
              {groupSyncPanel.lastResult
                ? formatGroupSyncStatusWord(groupSyncPanel.lastResult.statusLabel)
                : "—"}
            </div>
          </div>
        </div>
        {groupSyncPanel.lastResult ? (
          <>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-black/40"
              role="meter"
              aria-valuenow={Math.round(groupSyncPanel.lastResult.groupSyncRate * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Group sync rate"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-600/90 to-emerald-500/90 transition-[width] duration-300"
                style={{
                  width: `${Math.round(groupSyncPanel.lastResult.groupSyncRate * 100)}%`,
                }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] sm:grid-cols-4">
              <div>
                <span className="text-[var(--muted)]">eval block</span>
                <div className="text-cyan-200/80">{groupSyncPanel.lastResult.blockIndex}</div>
              </div>
              <div>
                <span className="text-[var(--muted)]">active</span>
                <div className="text-cyan-200/80">{groupSyncPanel.lastResult.activePlayerCount}</div>
              </div>
              <div>
                <span className="text-[var(--muted)]">correct</span>
                <div className="text-emerald-200/85">{groupSyncPanel.lastResult.correctPlayerCount}</div>
              </div>
              <div>
                <span className="text-[var(--muted)]">group accuracy</span>
                <div className="text-fuchsia-200/85">
                  {Math.round(groupSyncPanel.lastResult.groupAccuracy * 100)}%
                </div>
              </div>
              <div>
                <span className="text-[var(--muted)]">spread</span>
                <div className="text-sky-200/85">
                  {groupSyncPanel.lastResult.timeSpreadMeaningful && groupSyncPanel.lastResult.timeSpreadMs != null
                    ? `${groupSyncPanel.lastResult.timeSpreadMs.toFixed(0)} ms`
                    : "—"}
                </div>
              </div>
              <div>
                <span className="text-[var(--muted)]">group sync rate</span>
                <div className="text-sky-200/85">
                  {Math.round(groupSyncPanel.lastResult.groupSyncRate * 100)}%
                </div>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <span className="text-[var(--muted)]">sync status score</span>
                <div className="text-lg font-semibold tabular-nums text-emerald-200/95">
                  {Math.round(groupSyncPanel.lastResult.groupSyncRate * 100)}%
                </div>
              </div>
            </div>
            {groupSyncPanel.lastIntervalReport ? (
              <div className="mt-2 rounded-lg border border-[var(--border)]/70 bg-black/20 px-2.5 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Interval report ({groupSyncPanel.lastIntervalReport.intervalBeats} beats)
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] sm:grid-cols-3">
                  <div>
                    <span className="text-[var(--muted)]">blocks</span>
                    <div className="text-cyan-200/90">{groupSyncPanel.lastIntervalReport.evaluatedBlockCount}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">overall sync</span>
                    <div className="text-emerald-200/90">
                      {Math.round(groupSyncPanel.lastIntervalReport.overallGroupSync * 100)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">overall accuracy</span>
                    <div className="text-fuchsia-200/90">
                      {Math.round(groupSyncPanel.lastIntervalReport.overallGroupAccuracy * 100)}%
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-[var(--muted)]">
                  {groupSyncPanel.lastIntervalReport.individualAccuracies.length > 0
                    ? groupSyncPanel.lastIntervalReport.individualAccuracies
                        .map(
                          (r) =>
                            `P${r.playerId}: ${Math.round(r.averageAccuracy * 100)}% (${r.correctCount}/${r.judgedCount})`
                        )
                        .join(" · ")
                    : "No judged player actions in this interval."}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Play audio past the first beat window to see team sync for each finalized beat.
          </p>
        )}
      </div>
      ) : null}

      {!performanceMode ? (
      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-3 py-2 font-mono text-[10px] text-[var(--muted)]">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            detector:{" "}
            <span className="text-cyan-200/90">
              {debug.status === "loading" && "loading"}
              {debug.status === "ready" && "ready"}
              {debug.status === "error" && "error"}
            </span>
          </span>
          <span>
            people: <span className="text-cyan-200/90">{debug.numDetected}</span>
          </span>
          <span>
            fps: <span className="text-cyan-200/90">{debug.fps}</span>
          </span>
        </div>
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-amber-100/95">
          <div className="mb-1 font-semibold uppercase tracking-wide text-amber-200/85">
            Custom model — stage debug
          </div>
          <div>custom model loaded: {debug.customModelLoaded ? "yes" : "no"}</div>
          <div>custom inference running: {debug.customInferenceRunning ? "yes" : "no"}</div>
          <div>live pose input (stable): {debug.customPoseInputOk ? "yes" : "no"}</div>
          <div>
            latest prediction:{" "}
            {debug.customLive ? (
              <>
                {debug.customLive.label}{" "}
                <span className="text-amber-200/70">
                  ({Math.round(debug.customLive.confidence * 100)}% conf)
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="mt-1 text-[10px] text-[var(--muted)]">
          players:{" "}
          <span className="text-amber-200/90">
            {debug.playerLabels.length ? debug.playerLabels.join(", ") : "—"}
          </span>
        </div>
        <div className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted)]">
          <div className="mb-1 font-semibold uppercase tracking-wide text-[var(--muted)]">
            Actions & score (debug)
          </div>
          {debug.customLive ? (
            <div className="mb-2 rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 px-2 py-1 font-mono text-[9px] text-fuchsia-200/90">
              Custom softmax: {debug.customLive.label} ({Math.round(debug.customLive.confidence * 100)}%)
            </div>
          ) : null}
          <p className="mb-1 text-[9px] text-[var(--muted)] opacity-90">
            Default labels on video ~480ms (rule-based). Custom row = TF model preview. Judgment flash ~650ms.
            Each action beat judged once per player (rest beats ignored).
          </p>
          {debug.actionRows.length === 0 ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <ul className="space-y-1.5">
              {debug.actionRows.map((row) => (
                <li
                  key={row.playerId}
                  className="flex flex-col gap-0.5 border-b border-[var(--border)]/60 pb-1.5 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-cyan-200/90">P{row.playerId}</span>
                    <span className="text-amber-200/90">{row.lastAction ?? "—"}</span>
                    <span className="text-[var(--muted)]">
                      {row.lastTimeMs != null ? `${row.lastTimeMs.toFixed(0)} ms` : "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
                    <span>
                      score:{" "}
                      <span className="text-emerald-200/90">{row.score}</span>
                    </span>
                    <span>
                      combo: <span className="text-fuchsia-200/90">{row.combo}</span>
                    </span>
                    <span
                      className={
                        row.judgment === "PERFECT"
                          ? "text-emerald-300"
                          : row.judgment === "GOOD"
                            ? "text-amber-300"
                            : row.judgment === "MISS"
                              ? "text-rose-300/80"
                              : "text-[var(--muted)]"
                      }
                    >
                      {row.judgment ?? "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      ) : null}
    </section>
  );
}
