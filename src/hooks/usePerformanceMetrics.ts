"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPerformanceSummaryStats } from "@/lib/game/performanceSummary";
import type { PerformanceSessionResult } from "@/lib/game/performanceSessionResult";
import { computeFinalEvaluationMessage } from "@/lib/game/performanceSessionResult";
import type { GroupSyncBeatResult, GroupSyncIntervalReport } from "@/lib/game/types";

const SYNC_COMBO_MIN_RATE = 0.65;
const SYNC_BREAK_RATE = 0.45;
const ALMOST_SYNC_MAX = 0.65;
const STRONG_SYNC = 0.85;

const TEAM_FLOW_BLEND = 0.44;

function allPlayersCorrect(r: GroupSyncBeatResult): boolean {
  return r.activePlayerCount > 0 && r.correctPlayerCount === r.activePlayerCount;
}

function anyPlayerActive(r: GroupSyncBeatResult): boolean {
  return r.activePlayerCount > 0;
}

export type PerformanceSummaryCycle = {
  key: number;
  stats: ReturnType<typeof buildPerformanceSummaryStats>;
};

/** Passed from the app shell when Performance HUD + ingest are owned alongside PLAY / END. */
export type CameraStagePerformanceMetrics = {
  gameHud: PerformanceGameHud;
  cycle: PerformanceSummaryCycle | null;
  dismissCycle: () => void;
  ingestBlockResult: (result: GroupSyncBeatResult) => void;
  ingestIntervalReport: (report: GroupSyncIntervalReport) => void;
};

export type MicroFeedbackItem = {
  id: number;
  text: string;
};

export type PerformanceGameHud = {
  /** Cumulative successful sync rounds (no reset on miss). */
  syncCount: number;
  /** Cumulative all-correct rounds (no reset on wrong). */
  correctCount: number;
  teamFlow: number;
  syncPulseTick: number;
  correctPulseTick: number;
  micro: MicroFeedbackItem | null;
  flowScreenFlashKey: number;
  flowConfettiKey: number;
};

const INITIAL_FLOW = 1;

type BlockProcessResult = {
  next: PerformanceGameHud;
  micro: { text: string; ms: number } | null;
};

function processBlock(prev: PerformanceGameHud, result: GroupSyncBeatResult): BlockProcessResult {
  let syncCount = prev.syncCount;
  let correctCount = prev.correctCount;
  let syncPulseTick = prev.syncPulseTick;
  let correctPulseTick = prev.correctPulseTick;
  let flowScreenFlashKey = prev.flowScreenFlashKey;
  let flowConfettiKey = prev.flowConfettiKey;

  const rate = result.groupSyncRate;
  const syncStrong = rate >= SYNC_COMBO_MIN_RATE;
  const syncBroken = rate < SYNC_BREAK_RATE && anyPlayerActive(result);

  if (syncStrong) {
    syncCount += 1;
    syncPulseTick += 1;
  }

  if (anyPlayerActive(result) && allPlayersCorrect(result)) {
    correctCount += 1;
    correctPulseTick += 1;
  }

  /**
   * Recoverable team flow: mistakes pull it down; sync + correct rounds build it back up.
   * Smooth blend keeps motion readable (no sharp jumps).
   */
  const hadActive = anyPlayerActive(result);
  const allOk = allPlayersCorrect(result);

  let targetFlow = prev.teamFlow;
  targetFlow -= 0.004;
  if (syncStrong) {
    targetFlow += 0.034 + Math.max(0, rate - SYNC_COMBO_MIN_RATE) * 0.2;
  }
  if (hadActive && allOk) {
    targetFlow += 0.028;
  }
  if (syncBroken) {
    targetFlow -= 0.092;
  }
  if (hadActive && !allOk) {
    targetFlow -= 0.07;
  }
  targetFlow = Math.max(0, Math.min(1, targetFlow));

  const teamFlow = prev.teamFlow + (targetFlow - prev.teamFlow) * TEAM_FLOW_BLEND;

  const enteringMax = teamFlow >= 0.98 && prev.teamFlow < 0.92;
  if (enteringMax) {
    flowConfettiKey += 1;
    flowScreenFlashKey += 1;
  }

  const next: PerformanceGameHud = {
    ...prev,
    syncCount,
    correctCount,
    teamFlow,
    syncPulseTick,
    correctPulseTick,
    flowScreenFlashKey,
    flowConfettiKey,
  };

  const micro = pickMicroLine(result, syncCount, correctCount, enteringMax, result.blockIndex);

  return { next, micro };
}

const MICRO_DISPLAY_MS = 620;

function pickMicroLine(
  result: GroupSyncBeatResult,
  syncCount: number,
  correctCount: number,
  enteringMax: boolean,
  blockIndex: number
): { text: string; ms: number } | null {
  const rate = result.groupSyncRate;
  const hadActive = anyPlayerActive(result);
  const allOk = allPlayersCorrect(result);
  const beatAlt = (blockIndex & 1) === 0;

  if (enteringMax) return { text: "LOCKED IN!", ms: MICRO_DISPLAY_MS };

  if (hadActive && rate < SYNC_BREAK_RATE) return { text: "CATCH UP!", ms: MICRO_DISPLAY_MS };
  if (hadActive && !allOk) return { text: "KEEP IT TIGHT!", ms: MICRO_DISPLAY_MS };
  if (rate >= 0.45 && rate < ALMOST_SYNC_MAX) return { text: "ALMOST!", ms: MICRO_DISPLAY_MS };
  if (syncCount >= 28 || correctCount >= 28) return { text: "FEEL THE GROOVE!", ms: MICRO_DISPLAY_MS };
  if (rate >= STRONG_SYNC && allOk) {
    return { text: beatAlt ? "ON BEAT!" : "TOGETHER!", ms: MICRO_DISPLAY_MS };
  }
  if (rate >= SYNC_COMBO_MIN_RATE && allOk) {
    return { text: beatAlt ? "FEEL THE GROOVE!" : "ON BEAT!", ms: MICRO_DISPLAY_MS };
  }
  return null;
}

export function usePerformanceMetrics(performanceMode: boolean, sessionActive: boolean) {
  const perfRef = useRef(performanceMode);
  perfRef.current = performanceMode;
  /** Ingest gate: synced from props, overridden synchronously in `beginSession` / `endSession`. */
  const sessionRef = useRef(false);
  useEffect(() => {
    sessionRef.current = performanceMode && sessionActive;
  }, [performanceMode, sessionActive]);

  const [cycle, setCycle] = useState<PerformanceSummaryCycle | null>(null);
  const seqRef = useRef(0);
  /** First interval summary this session shows `NEXT ROUND!` once; then stats + mixed cues. */
  const hasShownFirstRoundMessageRef = useRef(false);

  const [hud, setHud] = useState<PerformanceGameHud>({
    syncCount: 0,
    correctCount: 0,
    teamFlow: INITIAL_FLOW,
    syncPulseTick: 0,
    correctPulseTick: 0,
    micro: null,
    flowScreenFlashKey: 0,
    flowConfettiKey: 0,
  });

  const hudRef = useRef(hud);
  hudRef.current = hud;

  const syncBaselineRef = useRef(0);
  const correctBaselineRef = useRef(0);
  const peakTeamFlowRef = useRef(INITIAL_FLOW);
  const sessionStartMsRef = useRef<number | null>(null);

  const microIdRef = useRef(0);
  const microTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessionResult, setSessionResult] = useState<PerformanceSessionResult | null>(null);

  const clearMicroTimer = useCallback(() => {
    if (microTimerRef.current != null) {
      clearTimeout(microTimerRef.current);
      microTimerRef.current = null;
    }
  }, []);

  const pushMicro = useCallback((text: string, ms: number) => {
    microIdRef.current += 1;
    const id = microIdRef.current;
    clearMicroTimer();
    setHud((h) => ({ ...h, micro: { id, text } }));
    microTimerRef.current = setTimeout(() => {
      setHud((h) => (h.micro?.id === id ? { ...h, micro: null } : h));
      microTimerRef.current = null;
    }, ms);
  }, [clearMicroTimer]);

  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  const resetSessionHud = useCallback(() => {
    peakTeamFlowRef.current = INITIAL_FLOW;
    syncBaselineRef.current = 0;
    correctBaselineRef.current = 0;
    sessionStartMsRef.current = performance.now();
    setHud({
      syncCount: 0,
      correctCount: 0,
      teamFlow: INITIAL_FLOW,
      syncPulseTick: 0,
      correctPulseTick: 0,
      micro: null,
      flowScreenFlashKey: 0,
      flowConfettiKey: 0,
    });
    hudRef.current = {
      syncCount: 0,
      correctCount: 0,
      teamFlow: INITIAL_FLOW,
      syncPulseTick: 0,
      correctPulseTick: 0,
      micro: null,
      flowScreenFlashKey: 0,
      flowConfettiKey: 0,
    };
  }, []);

  const beginSession = useCallback(() => {
    sessionRef.current = true;
    clearMicroTimer();
    seqRef.current = 0;
    hasShownFirstRoundMessageRef.current = false;
    setCycle(null);
    resetSessionHud();
    setSessionResult(null);
  }, [clearMicroTimer, resetSessionHud]);

  const endSession = useCallback((): PerformanceSessionResult | null => {
    /** Stop block/interval ingest immediately so rAF can’t mutate HUD after this snapshot. */
    sessionRef.current = false;
    const h = hudRef.current;
    const start = sessionStartMsRef.current;
    const durationSec =
      start != null ? Math.max(0, (performance.now() - start) / 1000) : 0;

    const raw: PerformanceSessionResult = {
      syncTotal: h.syncCount,
      correctTotal: h.correctCount,
      teamFlowFinal: h.teamFlow,
      peakTeamFlow: peakTeamFlowRef.current,
      durationSec,
      message: "",
    };
    raw.message = computeFinalEvaluationMessage(raw);
    setSessionResult(raw);
    return raw;
  }, []);

  const dismissSessionResults = useCallback(() => {
    setSessionResult(null);
  }, []);

  const ingestBlockResult = useCallback(
    (result: GroupSyncBeatResult) => {
      if (!perfRef.current || !sessionRef.current) return;

      const { next, micro } = processBlock(hudRef.current, result);

      peakTeamFlowRef.current = Math.max(peakTeamFlowRef.current, next.teamFlow);

      setHud(next);
      hudRef.current = next;

      if (micro) pushMicro(micro.text, micro.ms);
    },
    [pushMicro]
  );

  const ingestIntervalReport = useCallback(
    (report: GroupSyncIntervalReport) => {
      if (!perfRef.current || !sessionRef.current) return;
      seqRef.current += 1;
      const intervalSeq = seqRef.current;
      const isFirstIntervalOverlay = !hasShownFirstRoundMessageRef.current;
      if (isFirstIntervalOverlay) {
        hasShownFirstRoundMessageRef.current = true;
      }

      const h = hudRef.current;
      const dSync = h.syncCount - syncBaselineRef.current;
      const dCorrect = h.correctCount - correctBaselineRef.current;
      syncBaselineRef.current = h.syncCount;
      correctBaselineRef.current = h.correctCount;

      setCycle({
        key: intervalSeq,
        stats: buildPerformanceSummaryStats(
          report,
          {
            peakSyncCombo: dSync,
            peakCorrectCombo: dCorrect,
            teamFlowEnd: h.teamFlow,
          },
          { intervalSeq, isFirstIntervalOverlay }
        ),
      });
    },
    []
  );

  const dismissCycle = useCallback(() => {
    setCycle(null);
  }, []);

  useEffect(() => {
    if (!performanceMode) {
      dismissCycle();
      clearMicroTimer();
      hasShownFirstRoundMessageRef.current = false;
      setSessionResult(null);
      sessionStartMsRef.current = null;
      setHud({
        syncCount: 0,
        correctCount: 0,
        teamFlow: INITIAL_FLOW,
        syncPulseTick: 0,
        correctPulseTick: 0,
        micro: null,
        flowScreenFlashKey: 0,
        flowConfettiKey: 0,
      });
    }
  }, [performanceMode, dismissCycle, clearMicroTimer]);

  return {
    cycle,
    gameHud: hud,
    ingestBlockResult,
    ingestIntervalReport,
    dismissCycle,
    beginSession,
    endSession,
    sessionResult,
    dismissSessionResults,
  };
}
