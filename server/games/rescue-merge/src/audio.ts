/**
 * Procedural 8-Bit / Retro Web Audio API Synthesizer for Rescue Merge.
 * Synthesizes all sound effects directly without external audio files.
 */
export class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private lastDangerPingAt = 0;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;

    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Ignore resume errors prior to user gesture
      });
    }

    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * 1. Drop thud: Low frequency short pulse when releasing a pet.
   */
  public playDropThud(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.095);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.105);
  }

  /**
   * 2. Merge pop: Ascending two-note 8-bit chirp with pitch scaling up per tier.
   * @param newTier The tier created by the merge (2..6)
   */
  public playMergePop(newTier: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const clampedTier = Math.max(1, Math.min(6, newTier));
    // Scale base pitch upwards per tier
    const baseFreq = 260 + (clampedTier - 1) * 75;
    const secondFreq = baseFreq * 1.42;

    const now = ctx.currentTime;

    // First note of ascending chirp
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 0.065);

    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.075);

    // Second note of ascending chirp
    const note2Start = now + 0.065;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(secondFreq, note2Start);
    osc2.frequency.exponentialRampToValueAtTime(secondFreq * 1.22, note2Start + 0.095);

    gain2.gain.setValueAtTime(0.16, note2Start);
    gain2.gain.exponentialRampToValueAtTime(0.001, note2Start + 0.105);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(note2Start);
    osc2.stop(note2Start + 0.11);
  }

  /**
   * 3. Max tier reach (Tier 6 Sanctuary Mustang): Triumphant 8-bit chime sequence.
   */
  public playMaxTierChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5 -> E5 -> G5 -> C6 -> E6 triumphant fanfare arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    const durations = [0.09, 0.09, 0.09, 0.12, 0.34];

    let offset = 0.04;
    notes.forEach((freq, idx) => {
      const dur = durations[idx];
      const start = now + offset;

      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);

      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(freq * 0.5, start);

      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      subOsc.start(start);
      osc.stop(start + dur + 0.01);
      subOsc.stop(start + dur + 0.01);

      offset += dur * 0.82;
    });
  }

  /**
   * 4. Danger line ticking: Soft periodic warning ping while a pet is above the danger line.
   */
  public playDangerPing(urgencyRatio = 0.5): void {
    const performanceNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Periodically tick faster as timer approaches 2.5s
    const minIntervalMs = 460 - Math.min(1, Math.max(0, urgencyRatio)) * 210;
    if (performanceNow - this.lastDangerPingAt < minIntervalMs) {
      return;
    }
    this.lastDangerPingAt = performanceNow;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const pitch = 840 + Math.min(1, Math.max(0, urgencyRatio)) * 220;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.88, now + 0.075);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }
}
