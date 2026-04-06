/**
 * Turn noisy softmax predictions into discrete “gesture fired” events (per player).
 * Requires a short stability streak before emitting; enforces a minimum gap between emits.
 */

const STREAK_FRAMES = 4;
const MIN_GAP_MS = 420;
const MIN_CONF = 0.52;

export class CustomGestureEmitter {
  private streak = new Map<
    number,
    { label: string; count: number }
  >();
  private lastEmit = new Map<number, number>();

  /**
   * @returns label to emit, or null this frame
   */
  tryEmit(playerId: number, label: string, confidence: number, nowMs: number): string | null {
    if (confidence < MIN_CONF) {
      this.streak.delete(playerId);
      return null;
    }

    const s = this.streak.get(playerId);
    if (s?.label === label) {
      s.count += 1;
    } else {
      this.streak.set(playerId, { label, count: 1 });
    }

    const st = this.streak.get(playerId)!;
    if (st.count < STREAK_FRAMES) return null;

    const last = this.lastEmit.get(playerId) ?? 0;
    if (nowMs - last < MIN_GAP_MS) return null;

    this.lastEmit.set(playerId, nowMs);
    this.streak.set(playerId, { label, count: 0 });
    return label;
  }

  reset(): void {
    this.streak.clear();
    this.lastEmit.clear();
  }
}
