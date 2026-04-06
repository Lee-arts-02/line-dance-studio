"use client";

import { useEffect, useState, type RefObject } from "react";
import type { AudioEngine } from "@/lib/audio/audioEngine";

export type AudioEngineTick = {
  currentTime: number;
  bpm: number;
  currentBeatFloat: number;
};

/**
 * rAF-driven readout of the shared audio engine (beat clock source of truth for HUD overlays).
 */
export function useAudioEngineTick(engineRef: RefObject<AudioEngine | null>): AudioEngineTick {
  const [tick, setTick] = useState<AudioEngineTick>({
    currentTime: 0,
    bpm: 120,
    currentBeatFloat: 0,
  });

  useEffect(() => {
    let id = 0;
    const loop = () => {
      const engine = engineRef.current;
      if (engine) {
        setTick({
          currentTime: engine.getCurrentTime(),
          bpm: engine.getBpm(),
          currentBeatFloat: engine.getCurrentBeatFloat(),
        });
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [engineRef]);

  return tick;
}
