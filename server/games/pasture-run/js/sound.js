/**
 * Pasture Run — 1980s 8-Bit Web Audio Synthesizer
 * Synthesizes authentic retro arcade sound effects without external audio assets.
 */
class RetroAudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
    this.lastThrustSoundTime = 0;
    this.lastHoofTime = 0;
  }

  /**
   * Initializes and unlocks the Web Audio API context on user gesture ("TAP TO PLAY").
   */
  unlock() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      if (!this.ctx) {
        this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      // Play a silent buffer to guarantee iOS/Android mobile Web Audio unlock
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);

      this.unlocked = true;
      return true;
    } catch (err) {
      console.warn('Web Audio unlock warning:', err);
      return false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * Helper to schedule a single 8-bit oscillator tone.
   */
  playTone({
    type = 'square',
    freqStart = 440,
    freqEnd = null,
    duration = 0.12,
    delay = 0,
    gainPeak = 0.14,
  }) {
    if (this.muted) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== null && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.015);
  }

  /**
   * Jump / Gallop upward thrust "boing" sound.
   * Throttled so holding the screen creates a pleasant rhythmic arcade lift sound.
   */
  playThrustBoing(isInitialTap = false) {
    if (this.muted) return;
    const nowMs = performance.now();
    const cooldown = isInitialTap ? 75 : 165;
    if (nowMs - this.lastThrustSoundTime < cooldown) return;
    this.lastThrustSoundTime = nowMs;

    if (isInitialTap) {
      // Classic 80s springy jump boing
      this.playTone({
        type: 'square',
        freqStart: 190,
        freqEnd: 540,
        duration: 0.13,
        gainPeak: 0.13,
      });
      this.playTone({
        type: 'triangle',
        freqStart: 320,
        freqEnd: 680,
        duration: 0.11,
        delay: 0.04,
        gainPeak: 0.11,
      });
    } else {
      // Soft upward flutter pulse while holding thrust
      this.playTone({
        type: 'triangle',
        freqStart: 280,
        freqEnd: 460,
        duration: 0.09,
        gainPeak: 0.08,
      });
    }
  }

  /**
   * Subtle rhythmic hoofbeat tick when Mustang gallops along the pasture ground.
   */
  playGallopStep(stepIndex = 0) {
    if (this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoofTime < 120) return;
    this.lastHoofTime = nowMs;

    const pitch = stepIndex % 2 === 0 ? 135 : 108;
    this.playTone({
      type: 'triangle',
      freqStart: pitch,
      freqEnd: 55,
      duration: 0.045,
      gainPeak: 0.07,
    });
  }

  /**
   * Bright 8-bit coin/pickup chime for Red Apples (+25) and Golden Horseshoes (+50).
   */
  playPickupChime(type = 'apple') {
    if (this.muted) return;
    if (type === 'horseshoe') {
      // Sparkly 4-note golden arpeggio (C6 -> E6 -> G6 -> C7)
      const notes = [1046.5, 1318.5, 1567.98, 2093.0];
      notes.forEach((freq, idx) => {
        this.playTone({
          type: 'square',
          freqStart: freq,
          freqEnd: freq * 1.02,
          duration: 0.085,
          delay: idx * 0.055,
          gainPeak: 0.13,
        });
      });
    } else {
      // Classic 2-note arcade coin chime (B5 -> E6)
      this.playTone({
        type: 'square',
        freqStart: 987.77,
        duration: 0.07,
        delay: 0,
        gainPeak: 0.13,
      });
      this.playTone({
        type: 'square',
        freqStart: 1318.51,
        duration: 0.18,
        delay: 0.065,
        gainPeak: 0.14,
      });
    }
  }

  /**
   * Harsh 8-bit collision buzz when hitting brush, fence posts, or mud.
   */
  playCollisionBuzz() {
    if (this.muted) return;
    // Gritty low sawtooth + square dissonance
    this.playTone({
      type: 'sawtooth',
      freqStart: 150,
      freqEnd: 48,
      duration: 0.28,
      delay: 0,
      gainPeak: 0.2,
    });
    this.playTone({
      type: 'square',
      freqStart: 112,
      freqEnd: 38,
      duration: 0.26,
      delay: 0.02,
      gainPeak: 0.16,
    });
    this.playTone({
      type: 'sawtooth',
      freqStart: 85,
      freqEnd: 32,
      duration: 0.22,
      delay: 0.08,
      gainPeak: 0.15,
    });
  }

  /**
   * Upbeat arcade start jingle when tapping "TAP TO PLAY".
   */
  playStartJingle() {
    if (this.muted) return;
    const notes = [
      { f: 523.25, d: 0.08, t: 0.0 },   // C5
      { f: 659.25, d: 0.08, t: 0.08 },  // E5
      { f: 783.99, d: 0.08, t: 0.16 },  // G5
      { f: 1046.5, d: 0.20, t: 0.24 },  // C6
    ];
    notes.forEach((n) => {
      this.playTone({
        type: 'square',
        freqStart: n.f,
        duration: n.d,
        delay: n.t,
        gainPeak: 0.13,
      });
    });
  }

  /**
   * Retro Game Over descending melody.
   */
  playGameOver() {
    if (this.muted) return;
    const notes = [
      { f: 392.0, d: 0.16, t: 0.0 },    // G4
      { f: 369.99, d: 0.16, t: 0.17 },  // F#4
      { f: 349.23, d: 0.16, t: 0.34 },  // F4
      { f: 329.63, d: 0.42, t: 0.51 },  // E4
    ];
    notes.forEach((n) => {
      this.playTone({
        type: 'sawtooth',
        freqStart: n.f,
        freqEnd: n.f * 0.96,
        duration: n.d,
        delay: n.t,
        gainPeak: 0.14,
      });
    });
  }

}

window.retroAudio = new RetroAudioManager();
