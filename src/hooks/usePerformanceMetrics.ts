"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPerformanceSummaryStats } from "@/lib/game/performanceSummary";
import type { GroupSyncBeatResult, GroupSyncIntervalReport } from "@/lib/game/types";

const SYNC_COMBO_MIN_RATE = 0.65;
const SYNC_BREAK_RATE = 0.45;
const ALMOST_SYNC_MAX = 0.65;
const STRONG_SYNC = 0.85;

/** How much each block moves `teamFlow` toward its instantaneous target (damping). */
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

export type MicroFeedbackItem = {
  id: number;
  text: string;
};

export type PerformanceGameHud = {
  syncCombo: number;
  correctCombo: number;
  teamFlow: number;
  syncPulseTick: number;
  correctPulseTick: number;
  micro: MicroFeedbackItem | null;
  flowScreenFlashKey: number;
  flowConfettiKey: number;
};

/** Team flow starts full and decays unless the group maintains strong play. */
const INITIAL_FLOW = 1;

type BlockProcessResult = {
  next: PerformanceGameHud;
  micro: { text: string; ms: number } | null;
};

function processBlock(prev: PerformanceGameHud, result: GroupSyncBeatResult): BlockProcessResult {
  let syncCombo = prev.syncCombo;
  let correctCombo = prev.correctCombo;
  let syncPulseTick = prev.syncPulseTick;
  let correctPulseTick = prev.correctPulseTick;
  let flowScreenFlashKey = prev.flowScreenFlashKey;
  let flowConfettiKey = prev.flowConfettiKey;

  const rate = result.groupSyncRate;
  const syncStrong = rate >= SYNC_COMBO_MIN_RATE;
  const syncBroken = rate < SYNC_BREAK_RATE && anyPlayerActive(result);

  const prevSync = syncCombo;
  const prevCorrect = correctCombo;

  let syncReset = false;
  if (syncStrong) {
    syncCombo += 1;
    syncPulseTick += 1;
  } else if (syncBroken) {
    syncReset = syncCombo > 0;
    syncCombo = 0;
  }

  let correctReset = false;
  if (anyPlayerActive(result)) {
    if (allPlayersCorrect(result)) {
      correctCombo += 1;
      correctPulseTick += 1;
    } else {
      correctReset = correctCombo > 0;
      correctCombo = 0;
    }
  }

  const quality = (result.groupSyncRate + result.groupAccuracy) / 2;

  /**
   * Decay-forward meter: target slips down each block; good rounds pull it up; mistakes cut deeper.
   * Blend toward target for smooth motion (no harsh jumps).
   */
  let target = prev.teamFlow;
  target -= 0.0055;
  target += (quality - 0.48) * 0.072;
  if (syncReset) target -= 0.11;
  if (correctReset) target -= 0.125;
  target = Math.max(0, Math.min(1, target));

  const teamFlow = prev.teamFlow + (target - prev.teamFlow) * TEAM_FLOW_BLEND;

  const enteringMax = teamFlow >= 0.98 && prev.teamFlow < 0.92;
  if (enteringMax) {
    flowConfettiKey += 1;
    flowScreenFlashKey += 1;
  }

  const next: PerformanceGameHud = {
    ...prev,
    syncCombo,
    correctCombo,
    teamFlow,
    syncPulseTick,
    correctPulseTick,
    flowScreenFlashKey,
    flowConfettiKey,
  };

  const micro = pickMicroLine(
    result,
    syncCombo,
    correctCombo,
    prevSync,
    prevCorrect,
    enteringMax,
    result.blockIndex
  );

  return { next, micro };
}

/** Synced to `perf-micro-ddr` length; one visible line at a time (replaced on each new block). */
const MICRO_DISPLAY_MS = 620;

function pickMicroLine(
  result: GroupSyncBeatResult,
  syncAfter: number,
  correctAfter: number,
  prevSync: number,
  prevCorrect: number,
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
  if (prevSync > 0 && syncAfter === 0) return { text: "STAY IN SYNC!", ms: MICRO_DISPLAY_MS };
  if (prevCorrect > 0 && correctAfter === 0) return { text: "STAY IN SYNC!", ms: MICRO_DISPLAY_MS };
  if (syncAfter >= 10 || correctAfter >= 10) return { text: "FEEL THE GROOVE!", ms: MICRO_DISPLAY_MS };
  if (rate >= STRONG_SYNC && allOk) {
    return { text: beatAlt ? "ON BEAT!" : "TOGETHER!", ms: MICRO_DISPLAY_MS };
  }
  if (rate >= SYNC_COMBO_MIN_RATE && allOk) {
    return { text: beatAlt ? "FEEL THE GROOVE!" : "ON BEAT!", ms: MICRO_DISPLAY_MS };
  }
  return null;
}

export function usePerformanceMetrics(performanceMode: boolean) {
  const perfRef = useRef(performanceMode);
  perfRef.current = performanceMode;

  const [cycle, setCycle] = useState<PerformanceSummaryCycle | null>(null);
  const seqRef = useRef(0);

  const [hud, setHud] = useState<PerformanceGameHud>({
    syncCombo: 0,
    correctCombo: 0,
    teamFlow: INITIAL_FLOW,
    syncPulseTick: 0,
    correctPulseTick: 0,
    micro: null,
    flowScreenFlashKey: 0,
    flowConfettiKey: 0,
  });

  const hudRef = useRef(hud);
  hudRef.current = hud;

  const peakSyncRef = useRef(0);
  const peakCorrectRef = useRef(0);

  const microIdRef = useRef(0);
  const microTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMicroTimer = () => {
    if (microTimerRef.current != null) {
      clearTimeout(microTimerRef.current);
      microTimerRef.current = null;
    }
  };

  const pushMicro = useCallback((text: string, ms: number) => {
    microIdRef.current += 1;
    const id = microIdRef.current;
    clearMicroTimer();
    setHud((h) => ({ ...h, micro: { id, text } }));
    microTimerRef.current = setTimeout(() => {
      setHud((h) => (h.micro?.id === id ? { ...h, micro: null } : h));
      microTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  const ingestBlockResult = useCallback(
    (result: GroupSyncBeatResult) => {
      if (!perfRef.current) return;

      const { next, micro } = processBlock(hudRef.current, result);

      setHud(next);
      hudRef.current = next;

      peakSyncRef.current = Math.max(peakSyncRef.current, next.syncCombo);
      peakCorrectRef.current = Math.max(peakCorrectRef.current, next.correctCombo);

      if (micro) pushMicro(micro.text, micro.ms);
    },
    [pushMicro]
  );

  const ingestIntervalReport = useCallback((report: GroupSyncIntervalReport) => {
    if (!perfRef.current) return;
    seqRef.current += 1;
    const teamFlowEnd = hudRef.current.teamFlow;
    setCycle({
      key: seqRef.current,
      stats: buildPerformanceSummaryStats(report, {
        peakSyncCombo: peakSyncRef.current,
        peakCorrectCombo: peakCorrectRef.current,
        teamFlowEnd,
      }),
    });
    peakSyncRef.current = 0;
    peakCorrectRef.current = 0;
  }, []);

  const dismissCycle = useCallback(() => {
    setCycle(null);
  }, []);

  useEffect(() => {
    if (!performanceMode) {
      dismissCycle();
      clearMicroTimer();
      peakSyncRef.current = 0;
      peakCorrectRef.current = 0;
      setHud({
        syncCombo: 0,
        correctCombo: 0,
        teamFlow: INITIAL_FLOW,
        syncPulseTick: 0,
        correctPulseTick: 0,
        micro: null,
        flowScreenFlashKey: 0,
        flowConfettiKey: 0,
      });
    }
  }, [performanceMode, dismissCycle]);

  /** Slow ambient decay so flow gradually drops without new finalized blocks (timer, not rAF). */
  useEffect(() => {
    if (!performanceMode) return;
    const id = window.setInterval(() => {
      setHud((h) => ({
        ...h,
        teamFlow: Math.max(0, h.teamFlow - 0.0032),
      }));
    }, 2800);
    return () => clearInterval(id);
  }, [performanceMode]);

  return {
    cycle,
    gameHud: hud,
    ingestBlockResult,
    ingestIntervalReport,
    dismissCycle,
  };
}
