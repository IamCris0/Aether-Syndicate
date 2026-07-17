import * as THREE from 'three';
import {
  ACHIEVEMENTS,
  BATTLEPASS_TIERS,
  BP_XP_PER_TIER,
  WEAPONS,
  applyXp,
  bpTierFromXp,
  dailyMissions,
  getWeapon,
  rewardAtTier,
  weeklyMissions,
  xpToNextLevel,
  type BattlePassReward,
  type MissionDef,
  type WeaponDef,
} from '@aether/shared';
import type { PlayerProfile } from '../persistence/profile.js';
import { ensureMissionPeriods } from '../persistence/profile.js';
import { WEAPON_SKINS, buildWeaponModel } from '../game/WeaponView.js';

/**
 * UI del metajuego: tarjeta de perfil, armería con vista previa 3D,
 * pase de batalla en carril y misiones/logros. Solo DOM + perfil.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------------------------------------------------------------- cosméticos

export function applyCosmetics(profile: PlayerProfile): void {
  document.documentElement.style.setProperty(
    '--crosshair-color',
    profile.equippedCrosshair ?? 'rgba(220, 240, 255, 0.9)',
  );
}

/** XP ganada fuera de partida (misiones/logros): alimenta nivel y pase. */
function grantXp(profile: PlayerProfile, xp: number): void {
  const applied = applyXp(profile.level, profile.xp, xp);
  profile.level = applied.level;
  profile.xp = applied.xp;
  profile.bpXp += xp;
}

// ---------------------------------------------------------------- tarjeta de perfil

export function renderLobbyCard(profile: PlayerProfile, playerName: string): void {
  $('profile-name').textContent = `${profile.equippedEmblem ?? ''} ${playerName.toUpperCase()}`.trim();
  $('profile-title').textContent = profile.equippedTitle ?? 'Sin título';
  $('profile-level').textContent = `NIVEL ${profile.level}`;
  const need = xpToNextLevel(profile.level);
  $('xp-fill').style.width = `${Math.min((profile.xp / need) * 100, 100)}%`;
  $('profile-xp-text').textContent = `${profile.xp} / ${need} XP`;
  const s = profile.stats;
  $('profile-stats').textContent =
    `${s.kills} bajas · ${s.wins}/${s.matches} victorias · K/D ${(s.kills / Math.max(s.deaths, 1)).toFixed(2)}`;
}

// ---------------------------------------------------------------- armería 2.0

let armorySelected = '';
let armoryRenderer: THREE.WebGLRenderer | null = null;
let armoryScene: THREE.Scene | null = null;
let armoryCamera: THREE.PerspectiveCamera | null = null;
let armoryModel: THREE.Group | null = null;

const CLASS_LABELS: Record<string, string> = {
  ar: 'Rifle de asalto', smg: 'Subfusil', shotgun: 'Escopeta',
  sniper: 'Tirador', lmg: 'Ametralladora', pistol: 'Pistola',
  melee: 'Cuerpo a cuerpo', grenade: 'Granada',
};

export function openArmory(profile: PlayerProfile, onSave: () => void): void {
  armorySelected = profile.loadoutPrimary;
  renderArmoryList(profile, onSave);
  renderArmoryDetail(profile, onSave);
  ($('modal-armory') as HTMLDialogElement).showModal();
  startArmoryPreview(profile);
}

function renderArmoryList(profile: PlayerProfile, onSave: () => void): void {
  const list = $('armory-list');
  list.innerHTML = '';
  for (const weapon of Object.values(WEAPONS).filter((w) => w.slot === 0)) {
    const row = document.createElement('div');
    const equipped = weapon.id === profile.loadoutPrimary;
    row.className = `armory-item${weapon.id === armorySelected ? ' selected' : ''}${equipped ? ' equipped' : ''}`;
    row.innerHTML = `<strong>${weapon.name}</strong><span>${CLASS_LABELS[weapon.class]}</span>${equipped ? '<i>✓</i>' : ''}`;
    row.addEventListener('click', () => {
      armorySelected = weapon.id;
      renderArmoryList(profile, onSave);
      renderArmoryDetail(profile, onSave);
      updateArmoryModel(profile);
    });
    list.appendChild(row);
  }
}

function renderArmoryDetail(profile: PlayerProfile, onSave: () => void): void {
  const weapon = getWeapon(armorySelected);
  const primaries = Object.values(WEAPONS).filter((w) => w.slot === 0);
  const maxDmg = Math.max(...primaries.map((w) => w.damage * w.pellets));
  const maxRate = Math.max(...primaries.map((w) => w.fireRate));
  const maxRange = Math.max(...primaries.map((w) => w.range));

  $('armory-detail').innerHTML = `
    <h4>${weapon.name}</h4>
    <p class="armory-class">${CLASS_LABELS[weapon.class]} · cargador ${weapon.magazineSize} · ${weapon.automatic ? 'automática' : 'semiautomática'}</p>
    ${statBar('DAÑO', (weapon.damage * weapon.pellets) / maxDmg)}
    ${statBar('CADENCIA', weapon.fireRate / maxRate)}
    ${statBar('ALCANCE', weapon.range / maxRange)}
    ${statBar('CONTROL', 1 - Math.min(weapon.recoil.vertical / 0.05, 1))}`;

  const btn = $('armory-equip') as HTMLButtonElement;
  const equipped = armorySelected === profile.loadoutPrimary;
  btn.textContent = equipped ? 'EQUIPADA' : 'EQUIPAR';
  btn.disabled = equipped;
  btn.onclick = () => {
    profile.loadoutPrimary = armorySelected;
    onSave();
    renderArmoryList(profile, onSave);
    renderArmoryDetail(profile, onSave);
  };
}

const statBar = (label: string, value: number): string =>
  `<div class="stat"><label>${label}</label><div class="stat-bar"><i style="width:${Math.round(Math.max(value, 0.04) * 100)}%"></i></div></div>`;

/** Vista previa 3D del arma seleccionada (con la skin equipada). */
function startArmoryPreview(profile: PlayerProfile): void {
  const canvas = $('armory-canvas') as unknown as HTMLCanvasElement;
  if (!armoryRenderer) {
    armoryRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    armoryRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    armoryScene = new THREE.Scene();
    armoryCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
    armoryCamera.position.set(0.25, 0.12, 0.85);
    armoryCamera.lookAt(0, 0, 0);
    armoryScene.add(new THREE.AmbientLight(0x223044, 2));
    const key = new THREE.DirectionalLight(0xd8ecff, 3);
    key.position.set(1, 2, 2);
    const rim = new THREE.DirectionalLight(0x38e0c8, 2.5);
    rim.position.set(-2, 1, -1);
    armoryScene.add(key, rim);
  }
  updateArmoryModel(profile);

  const modal = $('modal-armory') as HTMLDialogElement;
  const loop = (): void => {
    if (!modal.open || !armoryRenderer || !armoryScene || !armoryCamera) return;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    armoryRenderer.setSize(w, h, false);
    armoryCamera.aspect = w / h;
    armoryCamera.updateProjectionMatrix();
    if (armoryModel) armoryModel.rotation.y += 0.012;
    armoryRenderer.render(armoryScene, armoryCamera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function updateArmoryModel(profile: PlayerProfile): void {
  if (!armoryScene) return;
  if (armoryModel) armoryScene.remove(armoryModel);
  const skin = WEAPON_SKINS[profile.equippedSkin ?? 'default'] ?? WEAPON_SKINS.default;
  armoryModel = buildWeaponModel(getWeapon(armorySelected), skin);
  armoryModel.scale.setScalar(1.15);
  armoryScene.add(armoryModel);
}

// ---------------------------------------------------------------- pase de batalla

export function openBattlepass(profile: PlayerProfile, onSave: () => void): void {
  renderBattlepass(profile, onSave);
  ($('modal-battlepass') as HTMLDialogElement).showModal();
  // Auto-scroll al nivel actual.
  const current = document.querySelector('.bp-card.current');
  current?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderBattlepass(profile: PlayerProfile, onSave: () => void): void {
  const tier = bpTierFromXp(profile.bpXp);
  const intoTier = profile.bpXp - Math.min(tier, BATTLEPASS_TIERS - 1) * BP_XP_PER_TIER;
  $('bp-progress-text').textContent =
    `NIVEL DE PASE ${tier} / ${BATTLEPASS_TIERS} · ${tier >= BATTLEPASS_TIERS ? 'COMPLETADO' : `${Math.max(intoTier, 0)} / ${BP_XP_PER_TIER} XP`}`;
  $('bp-progress-fill').style.width = `${Math.min((Math.max(intoTier, 0) / BP_XP_PER_TIER) * 100, 100)}%`;

  const claimables: number[] = [];
  const track = $('bp-track');
  track.innerHTML = '';
  for (let t = 1; t <= BATTLEPASS_TIERS; t++) {
    const reward = rewardAtTier(t);
    const unlocked = t <= tier;
    const claimed = profile.claimedTiers.includes(t);
    if (reward && unlocked && !claimed) claimables.push(t);

    const card = document.createElement('div');
    card.className = [
      'bp-card',
      unlocked ? 'unlocked' : 'locked',
      claimed ? 'claimed' : '',
      reward && unlocked && !claimed ? 'claimable' : '',
      t === Math.min(tier + 1, BATTLEPASS_TIERS) && tier < BATTLEPASS_TIERS ? 'current' : '',
    ].join(' ').trim();
    card.innerHTML = `
      <span class="bp-tier">${t}</span>
      <div class="bp-icon">${reward ? rewardIcon(reward) : '<span class="bp-empty">·</span>'}</div>
      <span class="bp-name">${reward ? reward.name : ''}</span>`;

    if (reward && unlocked) {
      card.addEventListener('click', () => {
        if (!profile.claimedTiers.includes(t)) profile.claimedTiers.push(t);
        equipReward(profile, reward);
        onSave();
        renderBattlepass(profile, onSave);
      });
    }
    track.appendChild(card);
  }

  const claimAll = $('bp-claim-all') as HTMLButtonElement;
  claimAll.disabled = claimables.length === 0;
  claimAll.textContent = claimables.length > 0 ? `RECLAMAR TODO (${claimables.length})` : 'TODO RECLAMADO';
  claimAll.onclick = () => {
    for (const t of claimables) {
      if (!profile.claimedTiers.includes(t)) profile.claimedTiers.push(t);
    }
    onSave();
    renderBattlepass(profile, onSave);
  };
}

function rewardIcon(r: BattlePassReward): string {
  if (r.type === 'crosshair') return `<span class="bp-reward dot" style="background:${r.value}"></span>`;
  if (r.type === 'skin') return `<span class="bp-reward dot skin" style="background:${r.value}"></span>`;
  if (r.type === 'emblem') return `<span class="bp-reward">${r.value}</span>`;
  return '<span class="bp-reward">Aa</span>';
}

function equipReward(profile: PlayerProfile, r: BattlePassReward): void {
  if (r.type === 'title') profile.equippedTitle = r.value;
  if (r.type === 'crosshair') profile.equippedCrosshair = r.value;
  if (r.type === 'emblem') profile.equippedEmblem = r.value;
  if (r.type === 'skin') profile.equippedSkin = r.id;
  applyCosmetics(profile);
}

// ---------------------------------------------------------------- misiones y logros

export function openMissions(profile: PlayerProfile, onSave: () => void): void {
  ensureMissionPeriods(profile);
  renderMissions(profile, onSave);
  ($('modal-missions') as HTMLDialogElement).showModal();
}

function renderMissions(profile: PlayerProfile, onSave: () => void): void {
  const wrap = $('missions-list');
  wrap.innerHTML = '';

  const section = (title: string): void => {
    const h = document.createElement('h4');
    h.className = 'missions-section';
    h.textContent = title;
    wrap.appendChild(h);
  };

  const missionRow = (m: MissionDef): void => {
    const progress = Math.min(profile.missionProgress[m.id] ?? 0, m.target);
    const claimed = profile.missionClaimed.includes(m.id);
    const complete = progress >= m.target;
    wrap.appendChild(rowEl(m.name, m.description, progress, m.target, m.xp, claimed, complete, () => {
      profile.missionClaimed.push(m.id);
      grantXp(profile, m.xp);
      onSave();
      renderMissions(profile, onSave);
    }));
  };

  section('MISIONES DIARIAS');
  for (const m of dailyMissions()) missionRow(m);
  section('MISIONES SEMANALES');
  for (const m of weeklyMissions()) missionRow(m);

  section('LOGROS');
  for (const a of ACHIEVEMENTS) {
    const progress = Math.min(profile.stats[a.stat], a.target);
    const claimed = profile.achievementsClaimed.includes(a.id);
    const complete = progress >= a.target;
    wrap.appendChild(rowEl(a.name, a.description, progress, a.target, a.xp, claimed, complete, () => {
      profile.achievementsClaimed.push(a.id);
      grantXp(profile, a.xp);
      onSave();
      renderMissions(profile, onSave);
    }));
  }
}

function rowEl(
  name: string, desc: string, progress: number, target: number, xp: number,
  claimed: boolean, complete: boolean, onClaim: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = `mission-row${claimed ? ' claimed' : complete ? ' complete' : ''}`;
  row.innerHTML = `
    <div class="mission-info">
      <strong>${name}</strong>
      <span>${desc}</span>
      <div class="mission-bar"><i style="width:${(progress / target) * 100}%"></i></div>
    </div>
    <div class="mission-right">
      <span class="mission-progress">${progress}/${target}</span>
      <span class="mission-xp">+${xp} XP</span>
    </div>`;
  const right = row.querySelector('.mission-right')!;
  if (claimed) {
    right.innerHTML += '<span class="mission-done">✓</span>';
  } else if (complete) {
    const btn = document.createElement('button');
    btn.className = 'btn primary mission-claim';
    btn.textContent = 'RECLAMAR';
    btn.addEventListener('click', onClaim);
    right.appendChild(btn);
  }
  return row;
}
