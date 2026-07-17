import {
  BATTLEPASS_TIERS,
  BP_XP_PER_TIER,
  WEAPONS,
  bpTierFromXp,
  rewardAtTier,
  xpToNextLevel,
  type BattlePassReward,
  type WeaponDef,
} from '@aether/shared';
import type { PlayerProfile } from '../persistence/profile.js';

/**
 * UI del metajuego: tarjeta de perfil, armería y pase de batalla.
 * Solo DOM + perfil; no conoce la red ni el renderer.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------------------------------------------------------------- cosméticos

/** Aplica las recompensas equipadas (retícula, etc.) al documento. */
export function applyCosmetics(profile: PlayerProfile): void {
  document.documentElement.style.setProperty(
    '--crosshair-color',
    profile.equippedCrosshair ?? 'rgba(220, 240, 255, 0.9)',
  );
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

// ---------------------------------------------------------------- armería

export function openArmory(profile: PlayerProfile, onSave: () => void): void {
  const modal = $('modal-armory') as HTMLDialogElement;
  renderArmory(profile, onSave);
  modal.showModal();
}

function renderArmory(profile: PlayerProfile, onSave: () => void): void {
  const list = $('armory-list');
  list.innerHTML = '';
  const primaries = Object.values(WEAPONS).filter((w) => w.slot === 0);
  const maxDamage = Math.max(...primaries.map((w) => w.damage * w.pellets));
  const maxRate = Math.max(...primaries.map((w) => w.fireRate));
  const maxRange = Math.max(...primaries.map((w) => w.range));

  for (const weapon of primaries) {
    const row = document.createElement('div');
    row.className = `armory-row${weapon.id === profile.loadoutPrimary ? ' selected' : ''}`;
    row.innerHTML = `
      <div class="armory-info">
        <strong>${weapon.name}</strong>
        <span class="meta">${classLabel(weapon)} · cargador ${weapon.magazineSize}</span>
      </div>
      <div class="armory-stats">
        ${statBar('DAÑO', (weapon.damage * weapon.pellets) / maxDamage)}
        ${statBar('CADENCIA', weapon.fireRate / maxRate)}
        ${statBar('ALCANCE', weapon.range / maxRange)}
      </div>
      <div class="armory-equip">${weapon.id === profile.loadoutPrimary ? 'EQUIPADA' : 'EQUIPAR'}</div>`;
    row.addEventListener('click', () => {
      profile.loadoutPrimary = weapon.id;
      onSave();
      renderArmory(profile, onSave);
    });
    list.appendChild(row);
  }
}

function classLabel(w: WeaponDef): string {
  const labels: Record<string, string> = {
    ar: 'Rifle de asalto', smg: 'Subfusil', shotgun: 'Escopeta',
    sniper: 'Francotirador', lmg: 'Ametralladora', pistol: 'Pistola',
    melee: 'Cuerpo a cuerpo', grenade: 'Granada',
  };
  return labels[w.class] ?? w.class;
}

const statBar = (label: string, value: number): string =>
  `<div class="stat"><label>${label}</label><div class="stat-bar"><i style="width:${Math.round(value * 100)}%"></i></div></div>`;

// ---------------------------------------------------------------- pase de batalla

export function openBattlepass(profile: PlayerProfile, onSave: () => void): void {
  const modal = $('modal-battlepass') as HTMLDialogElement;
  renderBattlepass(profile, onSave);
  modal.showModal();
}

function renderBattlepass(profile: PlayerProfile, onSave: () => void): void {
  const tier = bpTierFromXp(profile.bpXp);
  const intoTier = profile.bpXp - tier * BP_XP_PER_TIER;
  $('bp-progress-text').textContent =
    `NIVEL DE PASE ${tier} / ${BATTLEPASS_TIERS} · ${tier >= BATTLEPASS_TIERS ? 'COMPLETADO' : `${intoTier} / ${BP_XP_PER_TIER} XP`}`;
  $('bp-progress-fill').style.width = `${Math.min((intoTier / BP_XP_PER_TIER) * 100, 100)}%`;

  const grid = $('bp-grid');
  grid.innerHTML = '';
  for (let t = 1; t <= BATTLEPASS_TIERS; t++) {
    const reward = rewardAtTier(t);
    const unlocked = t <= tier;
    const claimed = profile.claimedTiers.includes(t);
    const cell = document.createElement('div');
    cell.className = [
      'bp-cell',
      unlocked ? 'unlocked' : 'locked',
      claimed ? 'claimed' : '',
      reward && unlocked && !claimed ? 'claimable' : '',
    ].join(' ').trim();

    cell.innerHTML = `<span class="bp-tier">${t}</span>${reward ? rewardIcon(reward) : '<span class="bp-empty">·</span>'}`;
    if (reward) cell.title = `${reward.name}${claimed ? ' (reclamada — clic para equipar)' : unlocked ? ' — clic para reclamar' : ''}`;

    if (reward && unlocked) {
      cell.addEventListener('click', () => {
        if (!profile.claimedTiers.includes(t)) profile.claimedTiers.push(t);
        equipReward(profile, reward);
        onSave();
        renderBattlepass(profile, onSave);
      });
    }
    grid.appendChild(cell);
  }
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
