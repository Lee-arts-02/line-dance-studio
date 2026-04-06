"use client";

import {
  DANCE_ACTION_IDS,
  DEFAULT_SYSTEM_ACTIONS,
  displayLabelForSequenceAction,
  normalizeSequenceAction,
  type SequenceActionId,
} from "@/lib/dance/sequence";

export type ChoreographyMode = "system" | "custom";

type ChoreographyPanelProps = {
  mode: ChoreographyMode;
  onModeChange: (mode: ChoreographyMode) => void;
  customSlots: readonly SequenceActionId[];
  onCustomSlotsChange: (slots: SequenceActionId[]) => void;
  /** Defaults + trained custom labels from the global model (see `CustomModelContext`). */
  availableActionIds: readonly string[];
};

const STORAGE_MODE = "music3-choreography-mode";
const STORAGE_SLOTS = "music3-choreography-custom-slots-v2";

function sanitizeSlots(slots: readonly string[], allowed: ReadonlySet<string>): SequenceActionId[] {
  return slots.map((s) => {
    const n = normalizeSequenceAction(s);
    return allowed.has(n) ? n : "step_left";
  });
}

export function loadChoreographyFromStorage(
  allowedFallback: readonly string[]
): {
  mode: ChoreographyMode;
  customSlots: SequenceActionId[];
} | null {
  if (typeof window === "undefined") return null;
  const allowed = new Set(allowedFallback);
  try {
    const modeRaw = window.localStorage.getItem(STORAGE_MODE);
    const slotsRaw = window.localStorage.getItem(STORAGE_SLOTS);
    if (modeRaw !== "system" && modeRaw !== "custom") return null;
    let customSlots: SequenceActionId[] = [...DEFAULT_SYSTEM_ACTIONS];
    if (slotsRaw) {
      const parsed = JSON.parse(slotsRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        customSlots = sanitizeSlots(
          parsed.map((x) => String(x)),
          allowed
        );
      }
    } else {
      const legacy = window.localStorage.getItem("music3-choreography-custom-slots");
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          customSlots = sanitizeSlots(
            parsed.map((x) => String(x)),
            allowed
          );
        }
      }
    }
    return { mode: modeRaw, customSlots };
  } catch {
    return null;
  }
}

export function saveChoreographyToStorage(
  mode: ChoreographyMode,
  customSlots: readonly SequenceActionId[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_MODE, mode);
    window.localStorage.setItem(STORAGE_SLOTS, JSON.stringify([...customSlots]));
  } catch {
    /* ignore quota */
  }
}

/**
 * Toggle system vs custom choreography and edit ordered action slots (expanded to action+rest beats automatically).
 */
export function ChoreographyPanel({
  mode,
  onModeChange,
  customSlots,
  onCustomSlotsChange,
  availableActionIds,
}: ChoreographyPanelProps) {
  const addSlot = () => {
    onCustomSlotsChange([...customSlots, "step_left"]);
  };

  const removeSlot = (index: number) => {
    if (customSlots.length <= 1) return;
    const next = customSlots.filter((_, i) => i !== index);
    onCustomSlotsChange(next);
  };

  const setSlotAt = (index: number, action: SequenceActionId) => {
    const next = [...customSlots];
    next[index] = normalizeSequenceAction(String(action));
    onCustomSlotsChange(next);
  };

  const resetToDefault = () => {
    onCustomSlotsChange([...DEFAULT_SYSTEM_ACTIONS]);
  };

  const loadSystemPreset = () => {
    onModeChange("system");
    onCustomSlotsChange([...DEFAULT_SYSTEM_ACTIONS]);
  };

  const defaultSet = new Set<string>(DANCE_ACTION_IDS);
  const trainedExtras = availableActionIds.filter((id) => !defaultSet.has(id));

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 p-4 shadow-inner">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
        Choreography
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
        Each move uses one beat; the next beat is prep/rest. Timing is scored only on move beats. Custom moves
        require a trained model (Custom Action Training).
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onModeChange("system")}
          className={
            mode === "system"
              ? "rounded-lg border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-100"
              : "rounded-lg border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)] hover:border-cyan-500/30"
          }
        >
          System default
        </button>
        <button
          type="button"
          onClick={() => onModeChange("custom")}
          className={
            mode === "custom"
              ? "rounded-lg border border-fuchsia-500/50 bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-100"
              : "rounded-lg border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)] hover:border-fuchsia-500/30"
          }
        >
          Personalized
        </button>
      </div>

      {mode === "custom" ? (
        <div className="mt-4 space-y-3">
          {trainedExtras.length === 0 ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200/90">
              No trained custom moves yet. Train a model under Custom Action Training to unlock more actions here.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addSlot}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text)] hover:border-emerald-500/40"
            >
              Add move
            </button>
            <button
              type="button"
              onClick={resetToDefault}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)] hover:border-amber-500/35"
            >
              Reset slots
            </button>
            <button
              type="button"
              onClick={loadSystemPreset}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)] hover:border-sky-500/35"
            >
              Load system preset
            </button>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-[12px] text-[var(--text)]">
            {customSlots.map((slot, index) => (
              <li key={index} className="marker:text-[var(--muted)]">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`choreo-slot-${index}`}>
                    Move {index + 1}
                  </label>
                  <select
                    id={`choreo-slot-${index}`}
                    value={slot}
                    onChange={(e) => setSlotAt(index, e.target.value)}
                    className="min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs font-medium text-[var(--text)]"
                  >
                    <optgroup label="Default (rule-based)">
                      {DANCE_ACTION_IDS.map((id) => (
                        <option key={id} value={id}>
                          {displayLabelForSequenceAction(id)}
                        </option>
                      ))}
                    </optgroup>
                    {trainedExtras.length > 0 ? (
                      <optgroup label="Custom (trained model)">
                        {trainedExtras.map((id) => (
                          <option key={id} value={id}>
                            {displayLabelForSequenceAction(id)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    disabled={customSlots.length <= 1}
                    className="rounded-md border border-rose-500/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-200/90 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          Using the built-in line: {DEFAULT_SYSTEM_ACTIONS.join(" → ")} (each followed by a prep beat).
        </p>
      )}
    </section>
  );
}
