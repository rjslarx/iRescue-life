/**
 * Procedural Web Audio API Synthesizer for Rescue Triple Match
 * Generates all sound effects without external audio assets.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Card tap / slide: Gentle wooden click sound
   */
  public playWoodClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Resonant wood-block body (pitch-dropping triangle oscillator)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.045);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * 3-Match clear: Harmonious 3-note upward celebration chime
   */
  public playMatchChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5 -> E5 -> G5 harmonious upward triad
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.075;
      const duration = 0.28;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  }

  /**
   * Game Over: Low buzz sound
   */
  public playGameOverBuzz(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const tones = [
      { freq: 155, offset: 0, dur: 0.22 },
      { freq: 116.5, offset: 0.2, dur: 0.42 }
    ];

    for (const t of tones) {
      const start = now + t.offset;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(t.freq, start);
      osc.frequency.linearRampToValueAtTime(t.freq * 0.88, start + t.dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, start);

      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + t.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  }

  /**
   * Level Win: Upbeat retro fanfare
   */
  public playVictoryFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Upbeat retro victory melody: C5, E5, G5, C6 (short), G5 (short), C6 (held)
    const sequence = [
      { freq: 523.25, delay: 0.0, dur: 0.11 },
      { freq: 659.25, delay: 0.11, dur: 0.11 },
      { freq: 783.99, delay: 0.22, dur: 0.11 },
      { freq: 1046.5, delay: 0.33, dur: 0.18 },
      { freq: 783.99, delay: 0.53, dur: 0.12 },
      { freq: 1046.5, delay: 0.67, dur: 0.48 }
    ];

    for (const note of sequence) {
      const start = now + note.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + note.dur + 0.02);
    }
  }
}
