/**
 * Audio 100% procedural con WebAudio (sin assets).
 * v0: disparos, impactos, bajas y daño con atenuación por distancia.
 * Preparado para sustituirse por samples reales + HRTF sin tocar el juego.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.7;

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  ensureContext(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Ganancia según distancia al oyente (1 = en la oreja). */
  private distanceGain(distance: number): number {
    return Math.min(1, 8 / Math.max(distance, 1));
  }

  playShot(distance = 0, heavy = false): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const g = this.distanceGain(distance) * (heavy ? 0.5 : 0.35);
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.25 : 0.12));

    const noise = this.noiseSource(0.25);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(heavy ? 900 : 2200, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.15);

    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.3);

    // Capa grave ("thump"): el punch que hace sentir pesado el disparo.
    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(heavy ? 85 : 110, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const tGain = this.ctx.createGain();
    tGain.gain.setValueAtTime(this.distanceGain(distance) * (heavy ? 0.55 : 0.35), t);
    tGain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.22 : 0.14));
    thump.connect(tGain).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.25);
  }

  playHit(): void {
    this.blip(1600, 0.05, 0.25);
  }

  playKill(): void {
    this.blip(520, 0.09, 0.3);
    setTimeout(() => this.blip(780, 0.12, 0.3), 90);
  }

  playDamage(): void {
    this.blip(180, 0.15, 0.4);
  }

  playExplosion(distance = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.distanceGain(distance) * 0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    const noise = this.noiseSource(0.9);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 0.7);

    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.9);
  }

  playThrow(): void {
    this.blip(340, 0.06, 0.15);
  }

  private blip(freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseSource(duration: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
