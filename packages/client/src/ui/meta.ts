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
import { buildOperator } from '../game/OperatorModel.js';
import { OPERATORS, getOperator, type OperatorDef } from '@aether/shared';

/**
 * UI del metajuego: tarjeta de perfil, armería con vista previa 3D,
 * pase de batalla en carril y misiones/logros. Solo DOM + perfil.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Navegación de pantallas (mismo sistema .screen/.active que main.ts). */
function showSection(id: string): void {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
  $(id).classList.add('active');
}

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
  showSection('screen-armory');
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

  const section = $('screen-armory');
  const loop = (): void => {
    if (!section.classList.contains('active') || !armoryRenderer || !armoryScene || !armoryCamera) return;
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

// ---------------------------------------------------------------- operadores

let opSelected = '';
let opRenderer: THREE.WebGLRenderer | null = null;
let opScene: THREE.Scene | null = null;
let opCamera: THREE.PerspectiveCamera | null = null;
let opModel: THREE.Group | null = null;

/** Un operador está desbloqueado si es gratuito o su nivel del pase fue reclamado. */
const operatorUnlocked = (profile: PlayerProfile, op: OperatorDef): boolean =>
  op.bpTier === null || profile.claimedTiers.includes(op.bpTier);

export function openOperators(profile: PlayerProfile, onSave: () => void, onEquip: () => void): void {
  opSelected = profile.equippedOperator;
  renderOperators(profile, onSave, onEquip);
  showSection('screen-operators');
  startOperatorPreview();
}

function renderOperators(profile: PlayerProfile, onSave: () => void, onEquip: () => void): void {
  const list = $('operators-list');
  list.innerHTML = '';
  for (const op of Object.values(OPERATORS)) {
    const unlocked = operatorUnlocked(profile, op);
    const equipped = op.id === profile.equippedOperator;
    const row = document.createElement('div');
    row.className = `armory-item${op.id === opSelected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
    row.innerHTML = `
      <strong><span class="op-swatch" style="background:#${op.accent.toString(16).padStart(6, '0')}"></span>${op.name}</strong>
      <span>${unlocked ? op.corp : `🔒 Nivel ${op.bpTier} del pase`}</span>
      ${equipped ? '<i>✓</i>' : ''}`;
    row.addEventListener('click', () => {
      opSelected = op.id;
      renderOperators(profile, onSave, onEquip);
      updateOperatorModel();
    });
    list.appendChild(row);
  }

  const op = getOperator(opSelected);
  const unlocked = operatorUnlocked(profile, op);
  $('operator-detail').innerHTML = `
    <h4>${op.name}</h4>
    <p class="armory-class">${op.corp}</p>
    <p class="op-desc">${op.description}</p>`;
  const btn = $('operator-equip') as HTMLButtonElement;
  const equipped = opSelected === profile.equippedOperator;
  btn.textContent = equipped ? 'EQUIPADO' : unlocked ? 'EQUIPAR' : `NIVEL ${op.bpTier} DEL PASE`;
  btn.disabled = equipped || !unlocked;
  btn.onclick = () => {
    profile.equippedOperator = opSelected;
    onSave();
    onEquip();
    renderOperators(profile, onSave, onEquip);
  };
}

function startOperatorPreview(): void {
  const canvas = $('operator-canvas') as unknown as HTMLCanvasElement;
  if (!opRenderer) {
    opRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    opRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    opScene = new THREE.Scene();
    opCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 10);
    opCamera.position.set(0.2, 1.15, 2.6);
    opCamera.lookAt(0, 0.95, 0);
    opScene.add(new THREE.AmbientLight(0x223044, 2));
    const key = new THREE.DirectionalLight(0xd8ecff, 3);
    key.position.set(1.5, 2.5, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(-2, 1.5, -2);
    opScene.add(key, rim);
  }
  updateOperatorModel();

  const section = $('screen-operators');
  const loop = (): void => {
    if (!section.classList.contains('active') || !opRenderer || !opScene || !opCamera) return;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    opRenderer.setSize(w, h, false);
    opCamera.aspect = w / h;
    opCamera.updateProjectionMatrix();
    if (opModel) opModel.rotation.y += 0.012;
    opRenderer.render(opScene, opCamera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function updateOperatorModel(): void {
  if (!opScene) return;
  if (opModel) opScene.remove(opModel);
  const op = getOperator(opSelected);
  opModel = buildOperator(op.accent, op.armor);
  opScene.add(opModel);
}

// ---------------------------------------------------------------- pase de batalla

export function openBattlepass(profile: PlayerProfile, onSave: () => void): void {
  renderBattlepass(profile, onSave);
  showSection('screen-battlepass');
  // Auto-scroll al nivel actual.
  const current = document.querySelector('.bp-card.current');
  current?.scrollIntoView({ block: 'center' });
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

/** Vista previa VISUAL de cada recompensa (no solo un icono). */
function rewardIcon(r: BattlePassReward): string {
  if (r.type === 'crosshair') {
    return `<span class="rp-crosshair" style="--c:${r.value}"><i></i><i></i><i></i><i></i><b></b></span>`;
  }
  if (r.type === 'skin') {
    return `<span class="rp-skin" style="--c:${r.value}">
      <svg viewBox="0 0 64 26" width="56" height="23">
        <path d="M2 11 h40 l5 -7 h5 v7 h10 v7 h-16 l-5 5 h-14 l-3 8 h-9 l3 -8 h-16 z"
              fill="#141b29" stroke="var(--c)" stroke-width="2"/>
        <rect x="14" y="13" width="18" height="3" fill="var(--c)"/>
      </svg></span>`;
  }
  if (r.type === 'operator') {
    return `<span class="rp-operator" style="--c:${r.value}">
      <svg viewBox="0 0 40 40" width="34" height="34">
        <rect x="8" y="4" width="24" height="22" rx="7" fill="#1a2334" stroke="#39465c" stroke-width="2"/>
        <rect x="12" y="14" width="16" height="5" rx="2" fill="var(--c)"/>
        <rect x="6" y="26" width="28" height="10" rx="3" fill="#232d40"/>
      </svg></span>`;
  }
  if (r.type === 'emblem') return `<span class="rp-emblem">${r.value}</span>`;
  return `<span class="rp-title">«${r.value}»</span>`;
}

function equipReward(profile: PlayerProfile, r: BattlePassReward): void {
  if (r.type === 'title') profile.equippedTitle = r.value;
  if (r.type === 'crosshair') profile.equippedCrosshair = r.value;
  if (r.type === 'emblem') profile.equippedEmblem = r.value;
  if (r.type === 'skin') profile.equippedSkin = r.id;
  if (r.type === 'operator') profile.equippedOperator = r.id;
  applyCosmetics(profile);
}

// ---------------------------------------------------------------- misiones y logros

export function openMissions(profile: PlayerProfile, onSave: () => void): void {
  ensureMissionPeriods(profile);
  renderMissions(profile, onSave);
  showSection('screen-missions');
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
