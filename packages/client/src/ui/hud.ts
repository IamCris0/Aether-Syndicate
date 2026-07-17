import {
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_SHIELD,
  type GravityKind,
  type PlayerSnapshot,
  type SelfState,
  type Snapshot,
} from '@aether/shared';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * HUD del juego: solo manipula DOM, no conoce la red ni el renderer.
 * Recibe datos ya digeridos desde GameClient.
 */
export class Hud {
  private root = $('hud');
  private barHealth = $('bar-health');
  private barShield = $('bar-shield');
  private kda = $('hud-kda');
  private ammo = $('hud-ammo');
  private reserve = $('hud-reserve');
  private weapon = $('hud-weapon');
  private reload = $('hud-reload');
  private timer = $('hud-timer');
  private scores = $('hud-scores');
  private gravity = $('hud-gravity');
  private fps = $('hud-fps');
  private ping = $('hud-ping');
  private killfeed = $('killfeed');
  private hitmarker = $('hitmarker');
  private vignette = $('damage-vignette');
  private respawnOverlay = $('respawn-overlay');
  private respawnTimer = $('respawn-timer');
  private matchendOverlay = $('matchend-overlay');
  private matchendSub = $('matchend-sub');
  private scoreboard = $('scoreboard');
  private scoreboardBody = $('scoreboard-body');
  private hint = $('hud-hint');
  private grenades = $('hud-grenades');
  private pauseOverlay = $('pause-overlay');
  private xpPopups = $('xp-popups');

  private vignetteTimeout: ReturnType<typeof setTimeout> | null = null;

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.killfeed.innerHTML = '';
    this.matchendOverlay.classList.add('hidden');
    this.respawnOverlay.classList.add('hidden');
    this.pauseOverlay.classList.add('hidden');
    this.scoreboard.classList.add('hidden');
  }

  setHint(visible: boolean): void {
    this.hint.classList.toggle('hidden', !visible);
  }

  updateSelf(me: PlayerSnapshot, self: SelfState, weaponName: string): void {
    this.barHealth.style.width = `${(Math.max(me.health, 0) / PLAYER_MAX_HEALTH) * 100}%`;
    this.barShield.style.width = `${(Math.max(me.shield, 0) / PLAYER_MAX_SHIELD) * 100}%`;
    this.kda.textContent = `${me.kills} / ${me.deaths} / ${me.assists}`;
    this.ammo.textContent = String(self.ammo);
    this.reserve.textContent = `/ ${self.reserveAmmo}`;
    this.weapon.textContent = weaponName;
    this.grenades.textContent = `◈ ×${self.grenades}`;
    this.grenades.classList.toggle('empty', self.grenades === 0);
    this.reload.classList.toggle('hidden', !self.reloading);
    this.ping.textContent = `${me.ping} ms`;

    if (!me.alive && self.respawnIn > 0) {
      this.respawnOverlay.classList.remove('hidden');
      this.respawnTimer.textContent = `Reaparición en ${self.respawnIn.toFixed(1)}s`;
    } else {
      this.respawnOverlay.classList.add('hidden');
    }
  }

  /** Pantalla de muerte: quién te eliminó y con qué. */
  setDeathInfo(killerName: string | null, weaponName: string, headshot: boolean): void {
    const title = document.getElementById('respawn-title')!;
    const sub = document.getElementById('respawn-sub')!;
    if (killerName) {
      title.textContent = `ELIMINADO POR ${killerName.toUpperCase()}`;
      sub.textContent = `${weaponName}${headshot ? ' · TIRO A LA CABEZA' : ''}`;
    } else {
      title.textContent = 'HAS CAÍDO';
      sub.textContent = weaponName;
    }
  }

  /** Botones de votación de mapa en la pantalla de fin de partida. */
  showMapVote(options: Array<{ id: string; name: string }>, onVote: (mapId: string) => void): void {
    const wrap = document.getElementById('mapvote')!;
    wrap.classList.remove('hidden');
    wrap.innerHTML = '<span class="mapvote-label">VOTA EL SIGUIENTE MAPA</span>';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'btn mapvote-btn';
      btn.textContent = opt.name;
      btn.addEventListener('click', () => {
        onVote(opt.id);
        for (const b of wrap.querySelectorAll('.mapvote-btn')) b.classList.remove('voted');
        btn.classList.add('voted');
      });
      wrap.appendChild(btn);
    }
  }

  updateMatch(snap: Snapshot, teams: boolean, selfId: string): void {
    const t = snap.scores.timeRemaining;
    this.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

    if (teams) {
      this.scores.innerHTML = `<span class="t0">${snap.scores.team0}</span><span>—</span><span class="t1">${snap.scores.team1}</span>`;
    } else {
      const sorted = [...snap.players].sort((a, b) => b.kills - a.kills);
      const top = sorted[0];
      const me = snap.players.find((p) => p.id === selfId);
      this.scores.innerHTML = top
        ? `<span class="t0">TOP ${top.kills}</span><span>·</span><span>TÚ ${me?.kills ?? 0}</span>`
        : '';
    }
  }

  setGravity(kind: GravityKind): void {
    const labels: Record<GravityKind, string> = {
      normal: 'GRAVEDAD NORMAL',
      low: 'GRAVEDAD REDUCIDA',
      zero: 'GRAVEDAD CERO',
      inverted: 'GRAVEDAD INVERTIDA',
    };
    this.gravity.textContent = labels[kind];
    this.gravity.className = `hud-gravity ${kind === 'zero' ? 'zero' : kind === 'low' ? 'low' : ''}`;
  }

  setFps(fps: number): void {
    this.fps.textContent = `${fps} FPS`;
  }

  addKillfeed(killer: string, victim: string, weapon: string, involvesMe: boolean): void {
    const entry = document.createElement('div');
    entry.className = `entry${involvesMe ? ' me' : ''}`;
    entry.textContent = `${killer}  [${weapon}]  ${victim}`;
    this.killfeed.prepend(entry);
    while (this.killfeed.children.length > 6) this.killfeed.lastChild?.remove();
    setTimeout(() => entry.remove(), 6000);
  }

  /** Hitmarker diferenciado: blanco (normal), dorado (headshot), rojo (kill). */
  flashHitmarker(kind: 'normal' | 'head' | 'kill' = 'normal'): void {
    this.hitmarker.className = 'hitmarker';
    void this.hitmarker.offsetWidth; // reinicia la animación
    this.hitmarker.classList.add('show', kind);
  }

  setPause(visible: boolean): void {
    this.pauseOverlay.classList.toggle('hidden', !visible);
  }

  private lastGap = -1;

  /** Separación del crosshair en px (spread visualizado). */
  setCrosshairGap(px: number): void {
    const rounded = Math.round(px * 2) / 2;
    if (rounded === this.lastGap) return;
    this.lastGap = rounded;
    this.crosshairEl.style.setProperty('--ch-gap', `${rounded}px`);
  }

  private crosshairEl = $('crosshair');

  /** Popup flotante de XP (+100 XP · BAJA). */
  showXpPopup(text: string): void {
    const el = document.createElement('div');
    el.className = 'xp-popup';
    el.textContent = text;
    this.xpPopups.prepend(el);
    while (this.xpPopups.children.length > 4) this.xpPopups.lastChild?.remove();
    setTimeout(() => el.remove(), 1800);
  }

  flashDamage(): void {
    this.vignette.classList.add('show');
    if (this.vignetteTimeout) clearTimeout(this.vignetteTimeout);
    this.vignetteTimeout = setTimeout(() => this.vignette.classList.remove('show'), 120);
  }

  showMatchEnd(text: string): void {
    this.matchendOverlay.classList.remove('hidden');
    this.matchendSub.textContent = text;
  }

  hideMatchEnd(): void {
    this.matchendOverlay.classList.add('hidden');
    const wrap = document.getElementById('mapvote');
    if (wrap) {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
    }
  }

  toggleScoreboard(show: boolean): void {
    this.scoreboard.classList.toggle('hidden', !show);
  }

  updateScoreboard(players: PlayerSnapshot[], selfId: string): void {
    const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.scoreboardBody.innerHTML = sorted
      .map((p) => {
        const cls = [`team${p.team}`, p.id === selfId ? 'me' : ''].join(' ').trim();
        return `<tr class="${cls}"><td>${escapeHtml(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${p.ping}</td><td>${p.level}</td></tr>`;
      })
      .join('');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
