import type { WeaponClass } from '@aether/shared';

/**
 * Audio 2.0 — dos capas:
 *  1. SAMPLES reales en /assets/audio/*.mp3 (pipeline Higgsfield): se cargan
 *     de forma perezosa; si un fichero falta, cae a la capa 2 sin errores.
 *  2. PROCEDURAL WebAudio: cada clase de arma tiene su carácter (freq,
 *     duración, cuerpo) — nada "suena igual" ni siquiera sin assets.
 * Atenuación por distancia en ambas capas.
 */

/** Perfil procedural por clase: [freqInicial, freqFinal, duración, volumen]. */
const SHOT_PROFILES: Record<WeaponClass, [number, number, number, number]> = {
  ar: [2200, 200, 0.13, 0.38],
  smg: [3000, 450, 0.08, 0.3],
  shotgun: [700, 90, 0.3, 0.55],
  sniper: [520, 70, 0.42, 0.6],
  lmg: [1500, 160, 0.17, 0.45],
  pistol: [3200, 500, 0.09, 0.35],
  melee: [900, 300, 0.1, 0.2],
  grenade: [400, 80, 0.5, 0.6],
};

const SAMPLES: Record<string, string> = {
  'shot-ar': '/assets/audio/shot-ar.mp3',
  'shot-smg': '/assets/audio/shot-smg.mp3',
  'shot-shotgun': '/assets/audio/shot-shotgun.mp3',
  'shot-sniper': '/assets/audio/shot-sniper.mp3',
  'shot-pistol': '/assets/audio/shot-pistol.mp3',
  reload: '/assets/audio/reload.mp3',
  footstep: '/assets/audio/footstep.mp3',
  explosion: '/assets/audio/explosion.mp3',
  gbounce: '/assets/audio/grenade-bounce.mp3',
  zerog: '/assets/audio/zerog-ambient.mp3',
};

/** Clase → sample (las clases sin sample propio reutilizan otro con pitch). */
const SHOT_SAMPLE: Partial<Record<WeaponClass, { name: string; rate: number }>> = {
  ar: { name: 'shot-ar', rate: 1 },
  smg: { name: 'shot-smg', rate: 1 },
  shotgun: { name: 'shot-shotgun', rate: 1 },
  sniper: { name: 'shot-sniper', rate: 1 },
  pistol: { name: 'shot-pistol', rate: 1 },
  lmg: { name: 'shot-ar', rate: 0.82 },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  volume = 0.7;

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  ensureContext(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    void this.preloadSamples();
  }

  private async preloadSamples(): Promise<void> {
    for (const [name, url] of Object.entries(SAMPLES)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx!.decodeAudioData(data));
      } catch {
        /* sin sample: la capa procedural cubre este sonido */
      }
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private distanceGain(distance: number): number {
    return Math.min(1, 8 / Math.max(distance, 1));
  }

  /** Reproduce un sample si está cargado. Devuelve false si no existe. */
  private playSample(name: string, vol: number, rate = 1): boolean {
    if (!this.ctx || !this.master) return false;
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.master);
    src.start();
    return true;
  }

  // ------------------------------------------------------------ disparos

  playShot(weaponClass: WeaponClass, distance = 0): void {
    if (!this.ctx || !this.master) return;
    const dist = this.distanceGain(distance);
    const sample = SHOT_SAMPLE[weaponClass];
    if (sample && this.playSample(sample.name, dist * 0.5, sample.rate * (0.97 + Math.random() * 0.06))) return;

    // Procedural: ráfaga de ruido filtrada con el perfil de la clase.
    const [f0, f1, dur, vol] = SHOT_PROFILES[weaponClass] ?? SHOT_PROFILES.ar;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(dist * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const noise = this.noiseSource(dur + 0.05);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ movimiento

  playFootstep(distance = 0): void {
    if (this.playSample('footstep', this.distanceGain(distance) * 0.22, 0.9 + Math.random() * 0.25)) return;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.distanceGain(distance) * 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    const noise = this.noiseSource(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260 + Math.random() * 120;
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.09);
  }

  playLand(intensity = 1): void {
    if (this.playSample('footstep', 0.35 * intensity, 0.6)) return;
    this.blip(120, 0.12, 0.3 * intensity);
  }

  // ------------------------------------------------------------ armas

  playReload(): void {
    if (this.playSample('reload', 0.4)) return;
    this.blip(700, 0.05, 0.2);
    setTimeout(() => this.blip(500, 0.05, 0.2), 350);
    setTimeout(() => this.blip(900, 0.06, 0.25), 800);
  }

  playSwitch(): void {
    this.blip(1100, 0.04, 0.18);
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

  playThrow(): void {
    this.blip(340, 0.06, 0.15);
  }

  playBounce(distance = 0): void {
    if (this.playSample('gbounce', this.distanceGain(distance) * 0.3, 0.92 + Math.random() * 0.16)) return;
    this.blip(900 + Math.random() * 300, 0.05, this.distanceGain(distance) * 0.2);
  }

  // ---------------------------------------------- ambiente gravedad cero

  private zeroGain: GainNode | null = null;
  private zeroSrc: AudioBufferSourceNode | OscillatorNode | null = null;

  /** Activa/desactiva el zumbido ambiental de gravedad cero (con fade). */
  setZeroG(active: boolean): void {
    if (!this.ctx || !this.master) return;
    if (active && !this.zeroSrc) {
      this.zeroGain = this.ctx.createGain();
      this.zeroGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.zeroGain.gain.exponentialRampToValueAtTime(0.16, this.ctx.currentTime + 0.8);
      const buffer = this.buffers.get('zerog');
      if (buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(this.zeroGain).connect(this.master);
        src.start();
        this.zeroSrc = src;
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 52;
        osc.connect(this.zeroGain).connect(this.master);
        osc.start();
        this.zeroSrc = osc;
      }
    } else if (!active && this.zeroSrc && this.zeroGain) {
      const src = this.zeroSrc;
      this.zeroGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
      setTimeout(() => src.stop(), 600);
      this.zeroSrc = null;
      this.zeroGain = null;
    }
  }

  playExplosion(distance = 0): void {
    if (this.playSample('explosion', this.distanceGain(distance) * 0.9)) return;
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

  // ------------------------------------------------------------ util

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
