/**
 * Ordered audio (WAV) playback queue for live talk.
 *
 * Sentence clips arrive as `(index, bytes)`. They are decoded with
 * `AudioContext.decodeAudioData` (possibly out of order) and scheduled back to back
 * strictly in `index` order. `stop()` cuts playback immediately (barge-in) and
 * discards anything still decoding.
 */
export class PlaybackQueue {
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private generation = 0;
  private nextIndex: number | null = null;
  private readonly ready = new Map<number, AudioBuffer | null>();
  private readonly sources = new Set<AudioBufferSourceNode>();
  private playhead = 0;
  private playing = false;
  private inFlight = 0;

  /** Called when audible playback starts or stops. */
  onPlayingChange?: (playing: boolean) => void;

  constructor() {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => undefined);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** True while audio is playing or clips are still being decoded/queued. */
  get isBusy(): boolean {
    return this.playing || this.inFlight > 0 || this.ready.size > 0;
  }

  /** Reset ordering for a new agent turn (also stops anything still playing). */
  startTurn(): void {
    this.stop();
  }

  /** Smoothly set output volume (0..1); used to duck audio while the user may be speaking. */
  setVolume(volume: number): void {
    this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
  }

  /** Add one encoded clip. Clips are played in ascending `index` order. */
  enqueue(index: number, data: ArrayBuffer): void {
    const gen = this.generation;
    // Indexing may be 0- or 1-based: the first index of a turn sets the baseline.
    if (this.nextIndex === null) this.nextIndex = index;
    this.inFlight++;
    this.ctx
      .decodeAudioData(data.slice(0))
      .then(
        (buffer) => buffer,
        () => null // undecodable clip: skip it rather than stall the queue
      )
      .then((buffer) => {
        if (gen !== this.generation) return; // stopped meanwhile (counter was reset)
        this.inFlight--;
        this.ready.set(index, buffer);
        this.flush(false);
      });
  }

  /**
   * The turn is over on the server: play whatever is buffered even if some
   * index never arrived (e.g. a sentence whose TTS failed).
   */
  finishTurn(): void {
    const gen = this.generation;
    const drain = () => {
      if (gen !== this.generation) return;
      if (this.inFlight > 0) {
        setTimeout(drain, 50);
        return;
      }
      this.flush(true);
    };
    drain();
  }

  /** Stop immediately and drop everything queued (barge-in). */
  stop(): void {
    this.generation++;
    this.ready.clear();
    this.nextIndex = null;
    this.inFlight = 0;
    for (const src of this.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* not started */
      }
    }
    this.sources.clear();
    this.playhead = 0;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.value = 1;
    this.setPlaying(false);
  }

  async close(): Promise<void> {
    this.stop();
    await this.ctx.close().catch(() => undefined);
  }

  private flush(skipGaps: boolean): void {
    if (this.nextIndex === null) return;
    while (true) {
      if (this.ready.has(this.nextIndex)) {
        const buffer = this.ready.get(this.nextIndex) ?? null;
        this.ready.delete(this.nextIndex);
        this.nextIndex++;
        if (buffer) this.schedule(buffer);
        continue;
      }
      if (skipGaps && this.ready.size > 0) {
        this.nextIndex = Math.min(...this.ready.keys());
        continue;
      }
      break;
    }
  }

  private schedule(buffer: AudioBuffer): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    const startAt = Math.max(this.ctx.currentTime + 0.02, this.playhead);
    src.start(startAt);
    this.playhead = startAt + buffer.duration;
    this.sources.add(src);
    this.setPlaying(true);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) this.setPlaying(false);
    };
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.onPlayingChange?.(playing);
  }
}
