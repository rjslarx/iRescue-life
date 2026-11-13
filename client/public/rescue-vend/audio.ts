/**
 * Procedural Web Audio Synthesizer for Rescue Vend
 * Zero external audio files required; unlocks automatically on first user gesture.
 */

export class VendingSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;

  constructor() {
    this.setupAutoUnlock();
  }

  private setupAutoUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.unlocked = true;
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.playKeypadBeep('A');
    }
    return this.muted;
  }

  /**
   * Crisp electronic dual-tone keypad beep (DTMF-inspired)
   */
  public playKeypadBeep(key: string = '1'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqMap: Record<string, [number, number]> = {
      A: [697, 1209],
      B: [770, 1209],
      C: [852, 1209],
      D: [941, 1209],
      '1': [697, 1336],
      '2': [770, 1477],
      CLR: [540, 900],
      PLUS: [770, 1633],
      MINUS: [697, 1100]
    };

    const [f1, f2] = freqMap[key.toUpperCase()] || [740, 1380];

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(f1, now);
    osc2.frequency.setValueAtTime(f2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.1);
    osc2.stop(now + 0.1);
  }

  /**
   * Dual-tone item selection / add-to-cart confirmation blip
   */
  public playSelectItem(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [880, 1318.5]; // A5 -> E6
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.095);
    });
  }

  /**
   * Subtle error buzz (e.g., invalid keypad code)
   */
  public playErrorBeep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.08);
    }
  }

  /**
   * 600ms low mechanical servo/motor whir during spiral coil dispensing
   */
  public playCoilMotor(durationMs: number = 600): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = durationMs / 1000;

    // Primary servo carrier
    const carrier = ctx.createOscillator();
    const subHarmonic = ctx.createOscillator();
    // Gear tooth LFO modulation
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const masterGain = ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(118, now);
    carrier.frequency.linearRampToValueAtTime(136, now + dur * 0.25);
    carrier.frequency.setValueAtTime(132, now + dur * 0.8);
    carrier.frequency.linearRampToValueAtTime(92, now + dur);

    subHarmonic.type = 'square';
    subHarmonic.frequency.setValueAtTime(59, now);
    subHarmonic.frequency.linearRampToValueAtTime(66, now + dur * 0.8);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(28, now);
    lfoGain.gain.setValueAtTime(18, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(2.4, now);

    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.14, now + 0.045);
    masterGain.gain.setValueAtTime(0.13, now + dur - 0.06);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency);

    carrier.connect(filter);
    subHarmonic.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    carrier.start(now);
    subHarmonic.start(now);
    lfo.start(now);

    carrier.stop(now + dur);
    subHarmonic.stop(now + dur);
    lfo.stop(now + dur);
  }

  /**
   * Heavy, satisfying hollow plastic/metal thud-clunk as item hits the bottom delivery chute
   */
  public playItemDrop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Primary low-end cabinet thud
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(165, now);
    thudOsc.frequency.exponentialRampToValueAtTime(42, now + 0.16);

    thudGain.gain.setValueAtTime(0.32, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.2);

    // 2. Hollow metallic chute clunk + flap rattle
    const clunkOsc = ctx.createOscillator();
    const clunkFilter = ctx.createBiquadFilter();
    const clunkGain = ctx.createGain();

    clunkOsc.type = 'triangle';
    clunkOsc.frequency.setValueAtTime(420, now + 0.015);
    clunkOsc.frequency.exponentialRampToValueAtTime(115, now + 0.11);

    clunkFilter.type = 'bandpass';
    clunkFilter.frequency.setValueAtTime(520, now + 0.015);
    clunkFilter.Q.setValueAtTime(3.5, now + 0.015);

    clunkGain.gain.setValueAtTime(0.24, now + 0.015);
    clunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    clunkOsc.connect(clunkFilter);
    clunkFilter.connect(clunkGain);
    clunkGain.connect(ctx.destination);

    clunkOsc.start(now + 0.015);
    clunkOsc.stop(now + 0.14);

    // 3. Secondary settling bounce clunk (90ms later)
    const bounceOsc = ctx.createOscillator();
    const bounceGain = ctx.createGain();
    bounceOsc.type = 'sine';
    bounceOsc.frequency.setValueAtTime(130, now + 0.095);
    bounceOsc.frequency.exponentialRampToValueAtTime(52, now + 0.19);

    bounceGain.gain.setValueAtTime(0.16, now + 0.095);
    bounceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    bounceOsc.connect(bounceGain);
    bounceGain.connect(ctx.destination);
    bounceOsc.start(now + 0.095);
    bounceOsc.stop(now + 0.21);
  }

  /**
   * Upbeat 4-note retro arcade victory chime upon dispense completion
   */
  public playVictoryChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5, E5, G5, C6
    const notes = [
      { freq: 523.25, delay: 0.0, duration: 0.13 },
      { freq: 659.25, delay: 0.11, duration: 0.13 },
      { freq: 783.99, delay: 0.22, duration: 0.14 },
      { freq: 1046.5, delay: 0.34, duration: 0.42 }
    ];

    for (const note of notes) {
      const start = now + note.delay;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      sub.type = 'square';
      osc.frequency.setValueAtTime(note.freq, start);
      sub.frequency.setValueAtTime(note.freq * 0.5, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.04, start);

      osc.connect(gain);
      sub.connect(subGain);
      subGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      sub.start(start);
      osc.stop(start + note.duration + 0.02);
      sub.stop(start + note.duration + 0.02);
    }
  }
}
