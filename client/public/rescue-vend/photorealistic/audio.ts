/**
 * Procedural Web Audio API Sound Engine for Rescue Supply Vendor
 * Zero external audio files. Synthesizes tactile vending machine acoustics.
 */

export class VendingSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    // AudioContext will be lazily initialized and resumed on first user interaction
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
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
      this.unlock();
      this.playTapTone(980);
    }
    return this.muted;
  }

  /**
   * 1. Keypad / Shelf Tap: Crisp mechanical membrane click + piezoelectric tone
   */
  public playTapTone(pitchHz: number = 1120): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Mechanical micro-switch click (short filtered noise burst)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.014);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2400, now);
    bandpass.Q.setValueAtTime(2.2, now);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.32, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);

    noise.connect(bandpass);
    bandpass.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    noise.start(now);

    // Crisp piezo confirmation beep
    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz, now + 0.005);
    osc.frequency.exponentialRampToValueAtTime(pitchHz * 1.03, now + 0.065);

    toneGain.gain.setValueAtTime(0.14, now + 0.005);
    toneGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

    osc.connect(toneGain);
    toneGain.connect(this.ctx.destination);

    osc.start(now + 0.005);
    osc.stop(now + 0.08);
  }

  /**
   * 2. Coil Motor: 750ms low-pitched electric auger/gear whir
   */
  public playCoilMotor(durationMs: number = 750): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = durationMs / 1000;

    // Base DC motor hum (sawtooth + lowpass)
    const motorOsc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const masterGain = this.ctx.createGain();

    motorOsc.type = 'sawtooth';
    motorOsc.frequency.setValueAtTime(118, now);
    motorOsc.frequency.linearRampToValueAtTime(134, now + 0.09);
    motorOsc.frequency.setValueAtTime(132, now + dur - 0.08);
    motorOsc.frequency.exponentialRampToValueAtTime(75, now + dur);

    // Gear tooth harmonic
    subOsc.type = 'square';
    subOsc.frequency.setValueAtTime(59, now);
    subOsc.frequency.linearRampToValueAtTime(66, now + 0.09);
    subOsc.frequency.exponentialRampToValueAtTime(42, now + dur);

    // Auger rotational modulation (torque ripple)
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14, now);
    lfoGain.gain.setValueAtTime(16, now);

    lfo.connect(lfoGain);
    lfoGain.connect(motorOsc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(390, now);
    filter.Q.setValueAtTime(3.2, now);

    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.16, now + 0.05);
    masterGain.gain.setValueAtTime(0.15, now + dur - 0.07);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    motorOsc.connect(filter);
    subOsc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    motorOsc.start(now);
    subOsc.start(now);
    lfo.start(now);

    motorOsc.stop(now + dur + 0.02);
    subOsc.stop(now + dur + 0.02);
    lfo.stop(now + dur + 0.02);
  }

  /**
   * 3. Shelf Drop & Chute Impact: Hollow thump-rattle followed by metallic chute flap swing
   */
  public playChuteImpact(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1) Primary hollow cabinet thump (low resonant pitch drop)
    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(155, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(42, now + 0.19);

    thumpGain.gain.setValueAtTime(0.38, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.23);

    // 2) Secondary rattle bounce inside the delivery bin (+85ms)
    const bounceOsc = this.ctx.createOscillator();
    const bounceGain = this.ctx.createGain();
    bounceOsc.type = 'triangle';
    bounceOsc.frequency.setValueAtTime(210, now + 0.085);
    bounceOsc.frequency.exponentialRampToValueAtTime(64, now + 0.23);

    bounceGain.gain.setValueAtTime(0.22, now + 0.085);
    bounceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    bounceOsc.connect(bounceGain);
    bounceGain.connect(this.ctx.destination);
    bounceOsc.start(now + 0.085);
    bounceOsc.stop(now + 0.26);

    // 3) Brushed aluminum "PUSH" flap swing clatter (+140ms & +290ms)
    const swingTimes = [0.13, 0.28];
    swingTimes.forEach((offset, idx) => {
      if (!this.ctx) return;
      const t = now + offset;
      const len = Math.floor(this.ctx.sampleRate * 0.09);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.3));
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(idx === 0 ? 920 : 760, t);
      bp.Q.setValueAtTime(4.5, t);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(idx === 0 ? 0.24 : 0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.ctx.destination);
      src.start(t);
    });
  }

  /**
   * 4. Completion: Warm celebratory chime chord arpeggio
   */
  public playCompletionChime(): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Warm C major 9th arpeggio: C5, E5, G5, B5, D6
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const start = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const harmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      harmonic.type = 'triangle';
      harmonic.frequency.setValueAtTime(freq * 2, start);

      const harmonicGain = this.ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.03, start);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.75);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      harmonic.start(start);
      osc.stop(start + 0.78);
      harmonic.stop(start + 0.78);
    });
  }
}
