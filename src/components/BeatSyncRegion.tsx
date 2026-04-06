"use client";

import { useEffect, useState, type RefObject } from "react";
import type { AudioEngine } from "@/lib/audio/audioEngine";
import type { BeatSlot } from "@/lib/dance/sequence";
import { SequenceBar } from "@/components/SequenceBar";
import { BeatDebugPanel } from "@/components/BeatDebugPanel";

type Tick = {
  currentTime: number;
  bpm: number;
  currentBeatFloat: number;
};

type BeatSyncRegionProps = {
  engineRef: RefObject<AudioEngine | null>;
  /** Step 7: hide beat/time debug in performance-focused layouts */
  showDebug?: boolean;
  sequenceVariant?: "default" | "hud";
  sequence: readonly BeatSlot[];
};

/**
 * Single requestAnimationFrame loop for the timeline + debug readout only.
 * Isolated from the rest of the page to avoid full-tree re-renders on each frame.
 */
export function BeatSyncRegion({
  engineRef,
  showDebug = true,
  sequenceVariant = "default",
  sequence,
}: BeatSyncRegionProps) {
  const [tick, setTick] = useState<Tick>({
    currentTime: 0,
    bpm: 120,
    currentBeatFloat: 0,
  });

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const engine = engineRef.current;
      if (engine) {
        setTick({
          currentTime: engine.getCurrentTime(),
          bpm: engine.getBpm(),
          currentBeatFloat: engine.getCurrentBeatFloat(),
        });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engineRef]);

  return (
    <div className="w-full min-w-0 flex-1">
      <SequenceBar
        variant={sequenceVariant}
        currentBeatFloat={tick.currentBeatFloat}
        sequence={sequence}
      />
      {showDebug ? (
        <BeatDebugPanel
          currentTime={tick.currentTime}
          bpm={tick.bpm}
          currentBeatFloat={tick.currentBeatFloat}
        />
      ) : null}
    </div>
  );
}
