/**
 * Line-dance choreography: each beat is either an action or a rest (prep buffer).
 * Pattern: action → rest → action → rest … on consecutive beats.
 *
 * Default rule-recognized moves: `step_left`, `step_right`, `clap`.
 * Additional `SequenceActionId` strings may come from the browser-trained custom model.
 */

/** Judgeable default moves (rule-based recognition only). */
export const DANCE_ACTION_IDS = ["step_left", "step_right", "clap"] as const;

export type DanceActionId = (typeof DANCE_ACTION_IDS)[number];

/** Built-in id or a normalized custom label from the trained TF.js model. */
export type SequenceActionId = DanceActionId | string;

/** @deprecated Use DanceActionId — kept for incremental refactors */
export type DanceStepId = DanceActionId;

const DEFAULT_ACTION_SET = new Set<string>(DANCE_ACTION_IDS);

export function isDefaultDanceAction(id: string): id is DanceActionId {
  return DEFAULT_ACTION_SET.has(id as DanceActionId);
}

/** Lowercase / trim for comparisons between UI, storage, and model output. */
export function normalizeSequenceAction(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Maps raw default-rule detection to the gameplay tag (score + on-screen label).
 * Video mirror is unchanged: physically stepping “camera left” still fires the same detector output,
 * but scoring/UI treat it as the opposite lateral move.
 */
export type LateralMappingMode = "front" | "back";

export function mapDetectedDefaultActionForGameplay(
  action: string,
  mode: LateralMappingMode = "front"
): string {
  const n = normalizeSequenceAction(String(action));
  if (mode === "back") {
    if (n === "step_left") return "step_right";
    if (n === "step_right") return "step_left";
  }
  return n;
}

/** One beat in the loop: perform a move, or rest / prep. */
export type BeatSlot =
  | { kind: "action"; action: SequenceActionId; displayLabel: string }
  | { kind: "rest"; label: "prep" };

/** One musical beat per grid cell (action or rest). */
export const BEATS_PER_PAIR = 2;

/** Human-readable short label for UI chips (uppercase). */
export function displayLabelForAction(action: DanceActionId): string {
  switch (action) {
    case "step_left":
      return "LEFT";
    case "step_right":
      return "RIGHT";
    case "clap":
      return "CLAP";
    default:
      return String(action).toUpperCase();
  }
}

/** Labels for default + custom string ids. */
export function displayLabelForSequenceAction(action: SequenceActionId): string {
  if (isDefaultDanceAction(action)) {
    return displayLabelForAction(action);
  }
  return String(action)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ACTION_STYLE: Record<
  DanceActionId,
  { chip: string; glow: string }
> = {
  step_left: {
    chip: "border-sky-400/70 bg-sky-500/15 text-sky-100",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.45)]",
  },
  step_right: {
    chip: "border-fuchsia-400/70 bg-fuchsia-500/15 text-fuchsia-100",
    glow: "shadow-[0_0_20px_rgba(232,121,249,0.45)]",
  },
  clap: {
    chip: "border-amber-400/70 bg-amber-500/15 text-amber-100",
    glow: "shadow-[0_0_20px_rgba(251,191,36,0.45)]",
  },
};

/** Styling for timeline chips: defaults use ACTION_STYLE; custom moves share a distinct look. */
export function getActionChipStyle(action: SequenceActionId): { chip: string; glow: string } {
  if (isDefaultDanceAction(action)) {
    return ACTION_STYLE[action];
  }
  return {
    chip: "border-violet-400/70 bg-violet-500/15 text-violet-100",
    glow: "shadow-[0_0_20px_rgba(167,139,250,0.4)]",
  };
}

/** Subtle styling for rest / prep beats in the sequence lane. */
export const REST_CHIP_CLASS =
  "border-white/20 bg-white/[0.06] text-white/45";

/**
 * Expands a list of dance actions into [action, rest, action, rest, …].
 * Each input action becomes one action beat followed by one rest beat.
 */
export function expandActionsToBeatSlots(actions: readonly SequenceActionId[]): BeatSlot[] {
  const out: BeatSlot[] = [];
  for (const a of actions) {
    const norm = normalizeSequenceAction(String(a));
    out.push({
      kind: "action",
      action: norm,
      displayLabel: displayLabelForSequenceAction(norm),
    });
    out.push({ kind: "rest", label: "prep" });
  }
  return out;
}

/** Built-in choreography: default cycle (each move followed by a prep beat). */
export const DEFAULT_SYSTEM_ACTIONS: readonly DanceActionId[] = [
  "step_right",
  "step_right",
  "step_left",
  "clap",
];

export const DEFAULT_BEAT_SEQUENCE: readonly BeatSlot[] =
  expandActionsToBeatSlots(DEFAULT_SYSTEM_ACTIONS);

/** Beats in one full loop of the default sequence (derived from defaults). */
export const SEQUENCE_LOOP_BEATS = DEFAULT_BEAT_SEQUENCE.length;

/** Pairs in the default loop (for `getBeatIndex()` / UI slot). */
export const PAIRS_PER_DEFAULT_LOOP = SEQUENCE_LOOP_BEATS / BEATS_PER_PAIR;

/** Loop index [0 .. loopLen) for a global integer beat. */
export function loopBeatIndexFromGlobalBeat(beatIndex: number, loopLen: number): number {
  const len = Math.max(1, Math.floor(loopLen));
  const b = Math.floor(beatIndex);
  return ((b % len) + len) % len;
}

export function getBeatSlotAtLoopIndex(loopBeat: number, sequence: readonly BeatSlot[]): BeatSlot {
  const len = sequence.length;
  if (len === 0) {
    return { kind: "rest", label: "prep" };
  }
  const i = ((loopBeat % len) + len) % len;
  return sequence[i]!;
}

export function getBeatSlotForGlobalBeat(
  beatIndex: number,
  sequence: readonly BeatSlot[]
): BeatSlot {
  const len = sequence.length;
  if (len === 0) {
    return { kind: "rest", label: "prep" };
  }
  const loopBeat = loopBeatIndexFromGlobalBeat(beatIndex, len);
  return getBeatSlotAtLoopIndex(loopBeat, sequence);
}

/**
 * First global beat index ≥ `fromBeat` whose slot is an action (pattern repeats every `sequence.length`).
 * Used by performance HUD to skip rest beats visually while keeping the same underlying beat clock.
 */
export function firstActionBeatOnOrAfter(
  fromBeat: number,
  sequence: readonly BeatSlot[]
): number | null {
  const len = sequence.length;
  if (len === 0) return null;
  for (let k = 0; k < len; k++) {
    const b = fromBeat + k;
    const slot = getBeatSlotForGlobalBeat(b, sequence);
    if (slot.kind === "action") return b;
  }
  return null;
}

/** Continuous beat → discrete global beat index (floor). */
export function beatFloatToBeatIndex(beatFloat: number): number {
  return Math.floor(beatFloat);
}

/**
 * Global pair index: each pair is [action beat, rest beat].
 * Used for group sync finalization (one team evaluation per pair).
 */
export function beatFloatToPairIndex(beatFloat: number): number {
  return Math.floor(beatFloat / BEATS_PER_PAIR);
}

/** Which pair slot within the default repeating pattern (for `getBeatIndex()` display). */
export function loopPairSlotFromPairIndex(pairIndex: number): number {
  const p = Math.floor(pairIndex);
  return ((p % PAIRS_PER_DEFAULT_LOOP) + PAIRS_PER_DEFAULT_LOOP) % PAIRS_PER_DEFAULT_LOOP;
}

/** Expected action for sync pair `pairIndex` (action is on the first beat of the pair). */
export function getExpectedActionForPairIndex(
  pairIndex: number,
  sequence: readonly BeatSlot[]
): SequenceActionId | null {
  const actionBeat = pairIndex * BEATS_PER_PAIR;
  const slot = getBeatSlotForGlobalBeat(actionBeat, sequence);
  return slot.kind === "action" ? slot.action : null;
}

/** Center of the beat window in continuous beat space (for timing judgment). */
export function actionBeatCenterBeatFloat(actionBeatIndex: number): number {
  return actionBeatIndex + 0.5;
}

// ——— Legacy names (narrower meaning now: pair index, not old 2-beat “block”) ———

/** @deprecated Prefer beatFloatToPairIndex — kept for audioEngine / gradual migration */
export function beatFloatToBlockIndex(beatFloat: number): number {
  return beatFloatToPairIndex(beatFloat);
}

/** @deprecated Prefer loopPairSlotFromPairIndex */
export function loopBlockSlotFromBlockIndex(blockIndex: number): number {
  return loopPairSlotFromPairIndex(blockIndex);
}

/**
 * @deprecated Old API returned a “block” of 2 beats — use getBeatSlotForGlobalBeat + pair helpers.
 * Returns the action slot for the pair containing `beatFloat` (for backward-compatible call sites).
 */
export type LegacySequenceBlock = {
  startBeat: number;
  durationBeats: number;
  step: SequenceActionId;
  displayLabel: string;
};

export function pairIndexToLegacyBlock(
  pairIndex: number,
  sequence: readonly BeatSlot[]
): LegacySequenceBlock {
  const len = sequence.length;
  const startBeat = pairIndex * BEATS_PER_PAIR;
  const slot = getBeatSlotForGlobalBeat(startBeat, sequence);
  if (slot.kind === "action") {
    return {
      startBeat: loopBeatIndexFromGlobalBeat(startBeat, len || 1),
      durationBeats: BEATS_PER_PAIR,
      step: slot.action,
      displayLabel: slot.displayLabel,
    };
  }
  return {
    startBeat: 0,
    durationBeats: BEATS_PER_PAIR,
    step: "step_left",
    displayLabel: "LEFT",
  };
}

export type SequenceItem = {
  slotIndex: number;
  step: SequenceActionId;
  displayLabel: string;
};

/** @deprecated Use getBeatSlotForGlobalBeat */
export function getSequenceItemForBeat(
  beatIndex: number,
  sequence: readonly BeatSlot[]
): SequenceItem {
  const len = sequence.length;
  const slot = getBeatSlotForGlobalBeat(beatIndex, sequence);
  if (slot.kind === "action") {
    return {
      slotIndex: loopBeatIndexFromGlobalBeat(beatIndex, len || 1),
      step: slot.action,
      displayLabel: slot.displayLabel,
    };
  }
  return {
    slotIndex: loopBeatIndexFromGlobalBeat(beatIndex, len || 1),
    step: "step_left",
    displayLabel: "PREP",
  };
}

/** @deprecated Use getExpectedActionForPairIndex + pair index */
export function getSequenceBlockForBlockIndex(
  blockIndex: number,
  sequence: readonly BeatSlot[]
): LegacySequenceBlock {
  return pairIndexToLegacyBlock(blockIndex, sequence);
}

/** @deprecated Use actionBeatCenterBeatFloat on the action beat index */
export function blockCenterBeatFloat(blockIndex: number): number {
  const actionBeat = blockIndex * BEATS_PER_PAIR;
  return actionBeatCenterBeatFloat(actionBeat);
}

/** Half-width of one action+rest pair in beats (for UI spanning). */
export const ACTION_BLOCK_BEATS = BEATS_PER_PAIR;
