import './styles/main.css';
import { GAME_MODES, MAPS, type GameModeId, type RoomOptions } from '@aether/shared';
import { Connection, type JoinExtra } from './net/Connection.js';
import { Input } from './core/Input.js';
import { GameClient } from './game/GameClient.js';
import { AudioManager } from './audio/AudioManager.js';
import { loadSettings, saveSettings, type PlayerSettings } from './persistence/storage.js';
import { bankMatchResult, loadProfile, saveProfile, type PlayerProfile } from './persistence/profile.js';
import { guestAuth } from './services/auth.js';
import { applyCosmetics, openArmory, openBattlepass, openMissions, renderLobbyCard } from './ui/meta.js';
import { LobbyScene } from './lobby/LobbyScene.js';

/**
 * Punto de entrada del cliente: gestiona las pantallas (login → lobby → juego)
 * y conecta la UI con la capa de red. La lógica de partida vive en GameClient.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $('game-canvas') as unknown as HTMLCanvasElement;
const input = new Input(canvas);
const audio = new AudioManager();

let connection: Connection | null = null;
let game: GameClient | null = null;
let settings: PlayerSettings;
let profile: PlayerProfile;

/** Datos del perfil que viajan con cada join (loadout de armería + nivel). */
const joinExtra = (): JoinExtra => ({
  loadout: [profile.loadoutPrimary, 'pistol-nomad', 'knife-fang'],
  level: profile.level,
});

const persistProfile = (): void => {
  void saveProfile(profile);
  renderLobbyCard(profile, settings.name);
};

// ---------------------------------------------------------------- pantallas

type ScreenId = 'screen-login' | 'screen-lobby' | null;

function showScreen(id: ScreenId): void {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
  if (id) $(id).classList.add('active');
}

// ---------------------------------------------------------------- login

async function init(): Promise<void> {
  [settings, profile] = await Promise.all([loadSettings(), loadProfile()]);
  applyCosmetics(profile);
  const nameInput = $('login-name') as HTMLInputElement;
  nameInput.value = settings.name;
  applySettingsToForm();

  $('btn-guest').addEventListener('click', async () => {
    audio.ensureContext();
    const identity = await guestAuth.signIn(nameInput.value.trim());
    settings.name = identity.displayName;
    await saveSettings(settings);
    enterLobby();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-guest').click();
  });
}

let lobbyScene: LobbyScene | null = null;

/** Música ambiental del lobby (generada con Higgsfield sonilo). */
const lobbyMusic = new Audio('/assets/audio/lobby-music.m4a');
lobbyMusic.loop = true;

function enterLobby(): void {
  showScreen('screen-lobby');
  renderLobbyCard(profile, settings.name);
  if (!lobbyScene) lobbyScene = new LobbyScene($('lobby-canvas') as unknown as HTMLCanvasElement);
  lobbyScene.start();
  lobbyMusic.volume = Math.min(settings.volume * 0.35, 1);
  void lobbyMusic.play().catch(() => { /* sin música si falta el asset */ });
  setStatus('');
  if (!connection) {
    connection = new Connection();
    connection.onDisconnect = () => {
      if (game) leaveGame('Conexión perdida con el servidor.');
    };
  }
}

function setStatus(text: string): void {
  $('lobby-status').textContent = text;
}

function closeAllModals(): void {
  for (const dialog of document.querySelectorAll('dialog')) dialog.close();
}

// ---------------------------------------------------------------- lobby → juego

async function startGame(join: () => Promise<Awaited<ReturnType<Connection['matchmake']>>>): Promise<void> {
  if (!connection) return;
  setStatus('Conectando…');
  const res = await join();
  if (!res.ok || !res.mapId || !res.mode) {
    setStatus(res.error ?? 'No se pudo entrar en la partida.');
    return;
  }
  setStatus('');
  showScreen(null);
  closeAllModals();
  lobbyScene?.stop();
  lobbyMusic.pause();

  game = new GameClient(canvas, connection, input, res.mapId, res.mode, settings, audio, {
    skinId: profile.equippedSkin,
  });
  game.onXpBanked = (result) => {
    bankMatchResult(profile, result);
    persistProfile();
  };
  game.start();
  document.title = `AETHER SYNDICATE — ${res.roomName} [${res.roomCode}]`;
}

function leaveGame(status = ''): void {
  game?.stop();
  game = null;
  connection?.leaveRoom();
  document.title = 'AETHER SYNDICATE';
  enterLobby();
  setStatus(status);
}

// ---------------------------------------------------------------- pausa y fin de partida

$('btn-resume').addEventListener('click', () => input.lock());

$('btn-pause-settings').addEventListener('click', () => ($('modal-settings') as HTMLDialogElement).showModal());

$('btn-abandon').addEventListener('click', () => leaveGame());

$('btn-back-lobby').addEventListener('click', () => leaveGame());

$('btn-play-again').addEventListener('click', () => {
  const conn = connection;
  if (!conn) return;
  game?.stop();
  game = null;
  conn.leaveRoom();
  showScreen('screen-lobby');
  void startGame(() => conn.matchmake(settings.name, joinExtra()));
});

// ---------------------------------------------------------------- botones lobby

$('btn-play').addEventListener('click', () => startGame(() => connection!.matchmake(settings.name, joinExtra())));

// Acceso rápido por modo (ritmo Arsenal: directo a Gun Game si quieres).
for (const btn of document.querySelectorAll<HTMLButtonElement>('.quick-modes [data-mode]')) {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as GameModeId;
    void startGame(() => connection!.matchmake(settings.name, joinExtra(), mode));
  });
}

$('btn-armory').addEventListener('click', () => openArmory(profile, persistProfile));

$('btn-battlepass').addEventListener('click', () => openBattlepass(profile, persistProfile));

$('btn-missions').addEventListener('click', () => openMissions(profile, persistProfile));

$('btn-create').addEventListener('click', () => {
  populateCreateForm();
  ($('modal-create') as HTMLDialogElement).showModal();
});

$('btn-join').addEventListener('click', () => ($('modal-join') as HTMLDialogElement).showModal());

$('btn-browse').addEventListener('click', () => {
  ($('modal-browse') as HTMLDialogElement).showModal();
  void refreshRooms();
});

$('btn-settings').addEventListener('click', () => ($('modal-settings') as HTMLDialogElement).showModal());

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => (btn.closest('dialog') as HTMLDialogElement).close());
}

// ---------------------------------------------------------------- crear sala

function populateCreateForm(): void {
  const modeSel = $('create-mode') as HTMLSelectElement;
  if (modeSel.options.length === 0) {
    for (const mode of Object.values(GAME_MODES)) {
      if (mode.id === 'custom') continue;
      const opt = document.createElement('option');
      opt.value = mode.id;
      opt.textContent = mode.implemented ? mode.name : `${mode.name} (próximamente)`;
      opt.disabled = !mode.implemented;
      modeSel.appendChild(opt);
    }
    const mapSel = $('create-map') as HTMLSelectElement;
    for (const map of Object.values(MAPS)) {
      const opt = document.createElement('option');
      opt.value = map.id;
      opt.textContent = map.name;
      mapSel.appendChild(opt);
    }
  }
}

$('form-create').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const options: Partial<RoomOptions> = {
    name: String(data.get('name') || `Sala de ${settings.name}`),
    password: String(data.get('password') || '') || undefined,
    mode: String(data.get('mode')) as GameModeId,
    mapId: String(data.get('mapId')),
    maxPlayers: Number(data.get('maxPlayers')),
    scoreLimit: Number(data.get('scoreLimit')),
    timeLimitS: Number(data.get('timeLimit')) * 60,
    bots: Number(data.get('bots')),
    gravityScale: Number(data.get('gravityScale')),
  };
  void startGame(() => connection!.createRoom(settings.name, options, joinExtra()));
});

// ---------------------------------------------------------------- unirse por código

$('form-join').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const code = String(data.get('code') || '').toUpperCase().trim();
  const password = String(data.get('password') || '') || undefined;
  if (code) void startGame(() => connection!.joinByCode(settings.name, code, password, joinExtra()));
});

// ---------------------------------------------------------------- explorar salas

async function refreshRooms(): Promise<void> {
  if (!connection) return;
  const list = $('room-list');
  list.innerHTML = '<p style="color:var(--muted)">Buscando salas…</p>';
  const rooms = await connection.listRooms();
  if (rooms.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">No hay salas públicas. ¡Crea una!</p>';
    return;
  }
  list.innerHTML = '';
  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML = `<div><strong>${room.name}</strong><div class="meta">${room.code} · ${room.mode.toUpperCase()} · ${room.mapId}</div></div><div class="meta">${room.players}/${room.maxPlayers}</div>`;
    row.addEventListener('click', () => {
      void startGame(() => connection!.joinByCode(settings.name, room.code, undefined, joinExtra()));
    });
    list.appendChild(row);
  }
}

$('btn-refresh-rooms').addEventListener('click', () => void refreshRooms());

// ---------------------------------------------------------------- ajustes

function applySettingsToForm(): void {
  const form = $('form-settings') as HTMLFormElement;
  (form.elements.namedItem('sensitivity') as HTMLInputElement).value = String(settings.sensitivity);
  (form.elements.namedItem('fov') as HTMLInputElement).value = String(settings.fov);
  (form.elements.namedItem('volume') as HTMLInputElement).value = String(settings.volume);
}

$('form-settings').addEventListener('submit', () => {
  const form = $('form-settings') as HTMLFormElement;
  settings.sensitivity = Number((form.elements.namedItem('sensitivity') as HTMLInputElement).value);
  settings.fov = Number((form.elements.namedItem('fov') as HTMLInputElement).value);
  settings.volume = Number((form.elements.namedItem('volume') as HTMLInputElement).value);
  input.sensitivity = settings.sensitivity;
  audio.setVolume(settings.volume);
  game?.applySettings(settings);
  void saveSettings(settings);
});

// ---------------------------------------------------------------- PWA

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* la PWA es opcional: el juego funciona sin service worker */
  });
}

void init();
