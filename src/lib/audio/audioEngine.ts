import { beatFloatToPairIndex, loopPairSlotFromPairIndex } from "@/lib/dance/sequence";

/**
 * Browser audio engine: playback, manual BPM, and beat index from the beat clock.
 * Beat index is derived from currentTime and BPM (no audio analysis).
 */
export class AudioEngine {
  private readonly audio: HTMLAudioElement;
  private bpm: number;
  private objectUrl: string | null = null;

  constructor(initialBpm = 120) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.bpm = initialBpm;
  }

  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  /** Load a built-in or remote URL (e.g. `/music/...`). */
  loadUrl(url: string, bpm: number): void {
    this.revokeObjectUrl();
    this.audio.src = url;
    this.bpm = bpm;
  }

  /** Load a user file; previous blob URL is revoked. */
  loadLocalFile(file: File, bpm: number): void {
    this.revokeObjectUrl();
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.bpm = bpm;
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  play(): Promise<void> {
    return this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  /** Pause and return playback to the start (t = 0). */
  reset(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  getCurrentTime(): number {
    return this.audio.currentTime;
  }

  /**
   * Continuous beat position in song space: (currentTime * BPM) / 60.
   * Same clock used for smooth timeline motion and future scoring.
   */
  getCurrentBeatFloat(): number {
    return (this.getCurrentTime() * this.bpm) / 60;
  }

  setCurrentTime(seconds: number): void {
    this.audio.currentTime = seconds;
  }

  getPaused(): boolean {
    return this.audio.paused;
  }

  getBpm(): number {
    return this.bpm;
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.bpm = bpm;
  }

  /**
   * Change tempo without jumping the musical beat index: preserves `getCurrentBeatFloat()` across the change.
   * Use for manual BPM edits and automatic progression so scoring / sequence stay aligned.
   */
  setBpmPreservingPlaybackBeat(newBpm: number): void {
    if (!Number.isFinite(newBpm) || newBpm <= 0) return;
    const t = this.audio.currentTime;
    const beatFloat = (t * this.bpm) / 60;
    this.bpm = newBpm;
    this.audio.currentTime = (beatFloat * 60) / newBpm;
  }

  /**
   * Current pair slot in [0, PAIRS_PER_LOOP) for the repeating 8-beat choreography pattern.
   */
  getBeatIndex(): number {
    const bf = this.getCurrentBeatFloat();
    const pi = beatFloatToPairIndex(bf);
    return loopPairSlotFromPairIndex(pi);
  }

  dispose(): void {
    this.pause();
    this.revokeObjectUrl();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
