"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AudioEngine } from "@/lib/audio/audioEngine";
import { useAudioEngineTick } from "@/lib/audio/useAudioEngineTick";
import { BUILT_IN_TRACKS } from "@/lib/audio/tracks";
import { BpmProgressionController } from "@/lib/game/bpmController";
import {
  createNeutralRewardState,
  RewardFeedbackController,
  type RewardVisualState,
} from "@/lib/game/rewards";
import type { GroupSyncBeatResult, GroupSyncIntervalReport } from "@/lib/game/types";
import { useCustomModel } from "@/context/CustomModelContext";
import {
  DEFAULT_BEAT_SEQUENCE,
  DEFAULT_SYSTEM_ACTIONS,
  expandActionsToBeatSlots,
  type LateralMappingMode,
  type SequenceActionId,
} from "@/lib/dance/sequence";
import { BeatSyncRegion } from "@/components/BeatSyncRegion";
import { CameraStage } from "@/components/CameraStage";
import {
  ChoreographyPanel,
  loadChoreographyFromStorage,
  saveChoreographyToStorage,
  type ChoreographyMode,
} from "@/components/ChoreographyPanel";
import { MusicPanel } from "@/components/MusicPanel";
import { PerformanceSequenceHud } from "@/components/PerformanceSequenceHud";
import { PerformanceControls, type PerformanceSessionPhase } from "@/components/PerformanceControls";
import { PerformanceResultsPanel } from "@/components/PerformanceResultsPanel";
import { usePerformanceMetrics } from "@/hooks/usePerformanceMetrics";
import { playResultSfxForResultsBuild, preloadResultSfx, stopResultSfx } from "@/lib/audio/resultSfx";

export default function Home() {
  const { availableChoreographyIds } = useCustomModel();
  const engineRef = useRef<AudioEngine | null>(null);
  const bpmRef = useRef(0);
  const rewardControllerRef = useRef<RewardFeedbackController | null>(null);
  const bpmProgressionRef = useRef<BpmProgressionController | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [perfSessionPhase, setPerfSessionPhase] = useState<PerformanceSessionPhase>("idle");
  /** Bumps when a session ends so the results panel runs one synchronized SFX + count-up pass. */
  const [perfResultPlaybackId, setPerfResultPlaybackId] = useState(0);
  /** Increments on each PLAY — resets CameraStage score/sync state for a fresh round. */
  const [perfSessionGeneration, setPerfSessionGeneration] = useState(0);

  const [selectedBuiltInId, setSelectedBuiltInId] = useState(BUILT_IN_TRACKS[0].id);
  const [bpm, setBpm] = useState(BUILT_IN_TRACKS[0].bpm);
  const [progressionBaseBpm, setProgressionBaseBpm] = useState(BUILT_IN_TRACKS[0].bpm);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<"built-in" | "custom">("built-in");
  const [customFileName, setCustomFileName] = useState<string | null>(null);

  const [rewardVisual, setRewardVisual] = useState<RewardVisualState>(createNeutralRewardState);
  const [confettiBurstKey, setConfettiBurstKey] = useState(0);
  const [latestGroupStatsReport, setLatestGroupStatsReport] = useState<GroupSyncIntervalReport | null>(
    null
  );

  const [choreographyMode, setChoreographyMode] = useState<ChoreographyMode>("system");
  const [customActionSlots, setCustomActionSlots] = useState<SequenceActionId[]>(() => [
    ...DEFAULT_SYSTEM_ACTIONS,
  ]);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [lateralMode, setLateralMode] = useState<LateralMappingMode>("front");
  const [cueIntervalSecInput, setCueIntervalSecInput] = useState(() =>
    String(Math.round((16 * 60) / BUILT_IN_TRACKS[0].bpm))
  );

  const hudTick = useAudioEngineTick(engineRef);

  const perfSessionActive = performanceMode && perfSessionPhase === "playing";
  const {
    gameHud: perfGameHud,
    cycle: perfSummaryCycle,
    dismissCycle: dismissPerfSummaryCycle,
    ingestBlockResult: perfIngestBlock,
    ingestIntervalReport: perfIngestInterval,
    beginSession: perfBeginSession,
    endSession: perfEndSession,
    sessionResult: perfSessionResult,
    dismissSessionResults: perfDismissSessionResults,
  } = usePerformanceMetrics(performanceMode, perfSessionActive);

  const beatSequence = useMemo(() => {
    if (choreographyMode === "system") return DEFAULT_BEAT_SEQUENCE;
    return expandActionsToBeatSlots(customActionSlots);
  }, [choreographyMode, customActionSlots]);
  const cueIntervalBeats = useMemo(() => {
    const sec = Number(cueIntervalSecInput);
    if (!Number.isFinite(sec) || sec <= 0) return 16;
    const raw = Math.round((sec * bpm) / 60);
    const even = Math.max(2, raw - (raw % 2));
    return even;
  }, [cueIntervalSecInput, bpm]);

  const choreoStorageKeyRef = useRef<string>("");

  useEffect(() => {
    const key = availableChoreographyIds.join(",");
    if (key === choreoStorageKeyRef.current) return;
    choreoStorageKeyRef.current = key;
    const saved = loadChoreographyFromStorage(availableChoreographyIds);
    if (saved) {
      setChoreographyMode(saved.mode);
      setCustomActionSlots(saved.customSlots);
    }
  }, [availableChoreographyIds]);

  useEffect(() => {
    saveChoreographyToStorage(choreographyMode, customActionSlots);
  }, [choreographyMode, customActionSlots]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (!performanceMode) setPerfSessionPhase("idle");
  }, [performanceMode]);

  const handlePerfPlay = useCallback(() => {
    const engine = engineRef.current;
    stopResultSfx();
    preloadResultSfx();
    engine?.reset();
    perfBeginSession();
    /** Commit perf round reset in CameraStage (group sync / scoreboard) before audio `play()`. */
    flushSync(() => {
      setPerfSessionGeneration((g) => g + 1);
      setPerfSessionPhase("playing");
    });
    if (engine) void engine.play().catch(() => {});
  }, [perfBeginSession]);

  const handlePerfEnd = useCallback(() => {
    const engine = engineRef.current;
    engine?.pause();
    engine?.reset();
    perfEndSession();
    /** Same user gesture as END — reliable `HTMLAudioElement.play()` vs autoplay rules. */
    playResultSfxForResultsBuild({ maxAudibleMs: 3000 });
    setPerfSessionPhase("ended");
    setPerfResultPlaybackId((n) => n + 1);
  }, [perfEndSession]);

  const handlePerfEndRef = useRef(handlePerfEnd);
  handlePerfEndRef.current = handlePerfEnd;

  const handlePerfResultsClose = useCallback(() => {
    stopResultSfx();
    perfDismissSessionResults();
    setPerfSessionPhase("idle");
  }, [perfDismissSessionResults]);

  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;
  const perfSessionPhaseRef = useRef(perfSessionPhase);
  perfSessionPhaseRef.current = perfSessionPhase;

  const loadBuiltIn = useCallback((id: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    const track = BUILT_IN_TRACKS.find((t) => t.id === id);
    if (!track) return;
    engine.loadUrl(track.url, track.bpm);
    setBpm(track.bpm);
    setProgressionBaseBpm(track.bpm);
    setSelectedBuiltInId(id);
    setMode("built-in");
    setCustomFileName(null);
    bpmProgressionRef.current?.reset(track.bpm);
    rewardControllerRef.current?.reset();
    setRewardVisual(createNeutralRewardState());
  }, []);

  useEffect(() => {
    const engine = new AudioEngine(BUILT_IN_TRACKS[0].bpm);
    engineRef.current = engine;
    engine.loadUrl(BUILT_IN_TRACKS[0].url, BUILT_IN_TRACKS[0].bpm);

    rewardControllerRef.current = new RewardFeedbackController();
    bpmProgressionRef.current = new BpmProgressionController(BUILT_IN_TRACKS[0].bpm);

    const el = engine.getAudioElement();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (performanceModeRef.current && perfSessionPhaseRef.current === "playing") {
        handlePerfEndRef.current();
      }
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    setHydrated(true);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      engine.dispose();
      engineRef.current = null;
      rewardControllerRef.current = null;
      bpmProgressionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !engineRef.current) return;
    engineRef.current.setBpmPreservingPlaybackBeat(bpm);
  }, [hydrated, bpm]);

  const displayTitle =
    mode === "custom" && customFileName
      ? customFileName
      : BUILT_IN_TRACKS.find((t) => t.id === selectedBuiltInId)?.title ?? "—";

  const handleSelectBuiltIn = (id: string) => {
    loadBuiltIn(id);
  };

  const handleBpmChange = (next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    setBpm(next);
    bpmProgressionRef.current?.onManualBpmChange(progressionBaseBpm);
  };

  const handleLocalFile = (file: File) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.loadLocalFile(file, bpm);
    setCustomFileName(file.name);
    setMode("custom");
    setProgressionBaseBpm(bpm);
    bpmProgressionRef.current?.reset(bpm);
    rewardControllerRef.current?.reset();
    setRewardVisual(createNeutralRewardState());
  };

  const handlePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.play().catch(() => {});
  };

  const handlePause = () => {
    engineRef.current?.pause();
  };

  const handleReset = () => {
    engineRef.current?.reset();
    setIsPlaying(false);
    bpmProgressionRef.current?.reset(progressionBaseBpm);
    rewardControllerRef.current?.reset();
    setRewardVisual(createNeutralRewardState());
  };

  const onGroupSyncFinalized = useCallback((result: GroupSyncBeatResult) => {
    const rc = rewardControllerRef.current;
    if (rc) {
      const rv = rc.onBeatFinalized(result);
      setRewardVisual(rv);
      if (rv.tier === "confetti") {
        setConfettiBurstKey((k) => k + 1);
      }
    }

    /** Performance Mode: fixed BPM — no streak-based speed-up / slow-down during playback. */
    if (performanceModeRef.current) return;

    const bc = bpmProgressionRef.current;
    const engine = engineRef.current;
    if (bc && engine) {
      const out = bc.onBeatFinalized(result, bpmRef.current);
      if (out.changed) {
        engine.setBpmPreservingPlaybackBeat(out.bpm);
        setBpm(out.bpm);
      }
    }
  }, []);

  const onGroupStatsInterval = useCallback((report: GroupSyncIntervalReport) => {
    setLatestGroupStatsReport(report);
  }, []);

  if (!hydrated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 text-[var(--muted)]">
        <p className="text-sm">Loading audio…</p>
      </main>
    );
  }

  const mainClass = performanceMode
    ? "fixed inset-0 z-40 flex flex-col bg-black"
    : "mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 px-3 py-6 sm:px-6";

  return (
    <main className={mainClass}>
      {performanceMode ? (
        <div className="pointer-events-none absolute right-3 top-3 z-50 flex flex-wrap items-center justify-end gap-2 text-[10px] text-white/50 sm:gap-3">
          <span className="pointer-events-auto tabular-nums">{Math.round(hudTick.bpm)} BPM</span>
          <PerformanceControls phase={perfSessionPhase} onPlay={handlePerfPlay} onEnd={handlePerfEnd} />
          <button
            type="button"
            onClick={() => setPerformanceMode(false)}
            className="pointer-events-auto rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm hover:bg-white/10"
          >
            Exit
          </button>
        </div>
      ) : null}

      <PerformanceResultsPanel
        open={performanceMode && perfSessionPhase === "ended" && perfSessionResult != null}
        playbackId={perfResultPlaybackId}
        result={perfSessionResult}
        onClose={handlePerfResultsClose}
      />

      {!performanceMode ? (
        <header className="text-center">
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Line Dance Studio
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/custom-actions"
              className="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              Custom Action Training
            </Link>
            <button
              type="button"
              onClick={() => setPerformanceMode(true)}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/25"
            >
              Performance mode
            </button>
          </div>
          <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 px-3 py-2 text-xs text-[var(--muted)]">
            <button
              type="button"
              onClick={() => setMirrorCamera((v) => !v)}
              className="rounded-lg border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
            >
              Camera: {mirrorCamera ? "Mirror ON" : "Mirror OFF"}
            </button>
            <button
              type="button"
              onClick={() => setLateralMode((m) => (m === "front" ? "back" : "front"))}
              className="rounded-lg border border-white/20 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/90 hover:bg-white/10"
            >
              Direction: {lateralMode === "front" ? "Front" : "Back"}
            </button>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/85">
              Cue every (seconds)
              <input
                type="number"
                min={1}
                step={1}
                value={cueIntervalSecInput}
                onChange={(e) => setCueIntervalSecInput(e.target.value)}
                className="w-20 rounded-md border border-white/20 bg-black/45 px-2 py-1 text-center font-mono text-white outline-none ring-cyan-400/60 focus:ring-2"
              />
            </label>
          </div>
        </header>
      ) : null}

      {!performanceMode ? (
        <div className="mx-auto w-full max-w-3xl px-1">
          <ChoreographyPanel
            mode={choreographyMode}
            onModeChange={setChoreographyMode}
            customSlots={customActionSlots}
            onCustomSlotsChange={setCustomActionSlots}
            availableActionIds={availableChoreographyIds}
          />
        </div>
      ) : null}

      {!performanceMode ? (
        <BeatSyncRegion
          engineRef={engineRef}
          showDebug
          sequenceVariant="hud"
          sequence={beatSequence}
        />
      ) : null}

      <div
        className={
          performanceMode
            ? "flex min-h-0 flex-1 flex-col px-2 pb-3 pt-12"
            : "flex flex-1 flex-col gap-8 lg:flex-row lg:items-start lg:gap-8"
        }
      >
        {!performanceMode ? (
          <MusicPanel
            engineRef={engineRef}
            tracks={BUILT_IN_TRACKS}
            selectedBuiltInId={selectedBuiltInId}
            onSelectBuiltIn={handleSelectBuiltIn}
            customLabel={customFileName}
            onLocalFile={handleLocalFile}
            bpm={bpm}
            onBpmChange={handleBpmChange}
            onPlay={handlePlay}
            onPause={handlePause}
            onReset={handleReset}
            isPlaying={isPlaying}
            displayTitle={displayTitle}
          />
        ) : null}

        <div
          className={
            performanceMode
              ? "relative flex min-h-0 w-full flex-1 flex-col"
              : "relative min-w-0 flex-1"
          }
        >
          {performanceMode ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-1">
              <PerformanceSequenceHud
                currentBeatFloat={hudTick.currentBeatFloat}
                sequence={beatSequence}
              />
            </div>
          ) : null}

          <CameraStage
            engineRef={engineRef}
            performanceMode={performanceMode}
            performanceSessionGeneration={perfSessionGeneration}
            mirrorCamera={mirrorCamera}
            lateralMode={lateralMode}
            performanceCueEveryBeats={
              performanceMode && beatSequence.length > 0
                ? cueIntervalBeats
                : undefined
            }
            onGroupSyncFinalized={onGroupSyncFinalized}
            onGroupStatsInterval={onGroupStatsInterval}
            rewardVisual={rewardVisual}
            confettiBurstKey={confettiBurstKey}
            choreographySequence={beatSequence}
            performanceBpm={performanceMode ? hudTick.bpm : undefined}
            performanceMetrics={
              performanceMode
                ? {
                    gameHud: perfGameHud,
                    cycle: perfSummaryCycle,
                    dismissCycle: dismissPerfSummaryCycle,
                    ingestBlockResult: perfIngestBlock,
                    ingestIntervalReport: perfIngestInterval,
                  }
                : null
            }
          />
        </div>
      </div>
      {!performanceMode && latestGroupStatsReport ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 px-4 py-3 text-xs text-[var(--muted)]">
          <div className="font-semibold uppercase tracking-wide">Latest group report</div>
          <div className="mt-1 font-mono">
            last window · blocks {latestGroupStatsReport.evaluatedBlockCount} ·{" "}
            {latestGroupStatsReport.intervalBeats} beats (~{Math.round(latestGroupStatsReport.intervalMs / 1000)}s)
          </div>
        </section>
      ) : null}
    </main>
  );
}
