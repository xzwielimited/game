/**
 * Procedural Web Audio API Sound Synthesizer
 * Clean-Room implementation for NavalCommand.io
 * Zero external audio files (0 KB audio assets in bundle).
 */

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.8;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {
      // AudioContext unavailable (e.g., non-interactive or testing environment)
      this.ctx = null;
    }
  }

  public resumeContext(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  /**
   * Helper to create a procedural white noise buffer for bursts and splashes.
   */
  private createNoiseBuffer(durationSeconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * durationSeconds);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Synthesize naval cannon boom. Caliber influences pitch and duration.
   */
  public playCannonBoom(caliberMm: number = 127, distance: number = 0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Attenuation based on distance
    const distFactor = Math.max(0.1, 1 / (1 + distance * 0.002));
    const baseFreq = Math.max(40, 180 - caliberMm * 0.25);
    const duration = Math.min(1.8, 0.4 + caliberMm * 0.0025);

    // 1. Sub-bass tonal drop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = caliberMm > 300 ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + duration * 0.8);

    oscGain.gain.setValueAtTime(distFactor * 0.9, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration);

    // 2. High-energy muzzle blast noise burst
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + caliberMm * 2, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + duration * 0.5);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(distFactor * 0.7, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + duration);
    }
  }

  /**
   * Synthesize acoustic torpedo launch whoosh.
   */
  public playTorpedoWhoosh(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 0.9;

    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.0;
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(650, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Synthesize active sonar ping with harmonic resonance.
   */
  public playSonarPing(frequency: number = 1000): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 2.2;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    // Slight frequency modulation upward
    osc.frequency.linearRampToValueAtTime(frequency * 1.05, now + 0.1);
    osc.frequency.linearRampToValueAtTime(frequency, now + 0.2);

    // Fast attack, long reverberant exponential decay
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Synthesize dynamic water splash or depth-charge water plume.
   */
  public playWaterSplash(size: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 0.7 * size;

    const noiseBuffer = this.createNoiseBuffer(duration);
    if (!noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.linearRampToValueAtTime(1200, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(250, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5 * Math.min(1.2, size), now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Synthesize massive vector explosion / ship sinking detonation.
   */
  public playExplosion(intensity: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 1.5 * Math.max(0.6, intensity);

    // 1. Heavy rumbling sub oscillator
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(90, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + duration * 0.9);

    subGain.gain.setValueAtTime(0.8, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + duration);

    // 2. High-impact randomized noise explosion
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + duration);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.75, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(now);
      noise.stop(now + duration);
    }
  }

  /**
   * Start or modulate continuous marine engine hum and prop cavitation.
   * Intentionally silenced (no-op) per M9 requirements: only discrete combat FX are played.
   */
  public updateEngineSound(_throttle: number, _speedKnots: number): void {
    // Intentionally no-op to eliminate loud annoying engine drone.
    // Audio engine strictly reserves Web Audio playback for discrete combat events:
    // cannon fire, torpedo launches, explosions, water splashes, and sonar pings.
    return;
  }

  public stopEngineSound(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }
}

// Global singleton instance for application use
export const soundSynth = new SoundSynthesizer();
