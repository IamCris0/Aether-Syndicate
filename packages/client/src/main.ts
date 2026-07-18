import './styles/main.css';
import { GAME_MODES, MAPS, type GameModeId, type RoomOptions } from '@aether/shared';
import { Connection, type JoinExtra } from './net/Connection.js';
import { Input } from './core/Input.js';
import { GameClient } from './game/GameClient.js';
import { AudioManager } from './audio/AudioManager.js';
import { loadSettings, saveSettings, type PlayerSettings } from './persistence/storage.js';
import { bankMatchResult, loadProfile, saveProfile, type PlayerProfile } from './persistence/profile.js';
import { guestAuth } from './services/auth.js';
import { getSupabase } from './services/supabase.js';
import { claimUsername, fetchCloudRecord, pushCloudProfile, resolveProfiles } from './persistence/cloudSync.js';
import { applyCosmetics, openArmory, openBattlepass, openMissions, openOperators, renderLobbyCard } from './ui/meta.js';
import { getOperator } from '@aether/shared';
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
  operatorId: profile.equippedOperator,
});

/** Id de usuario Supabase cuando hay sesión (null = invitado local). */
let cloudUserId: string | null = null;

const persistProfile = (): void => {
  void saveProfile(profile);
  if (cloudUserId) pushCloudProfile(cloudUserId, profile);
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

  await initCloudAuth();
}

/** Login con Google vía Supabase + restauración de sesión y perfil en nube. */
async function initCloudAuth(): Promise<void> {
  const supa = getSupabase();
  const googleBtn = $('btn-google') as HTMLButtonElement;
  if (!supa) return; // sin .env: el botón queda deshabilitado

  googleBtn.disabled = false;
  googleBtn.textContent = 'INICIAR SESIÓN CON GOOGLE';
  googleBtn.title = '';
  googleBtn.addEventListener('click', () => {
    void supa.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  // Sesión ya activa (o recién vuelta del redirect de OAuth).
  const { data } = await supa.auth.getSession();
  if (data.session) await onCloudSignIn(data.session.user.id, data.session.user);
  supa.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && cloudUserId !== session.user.id) {
      void onCloudSignIn(session.user.id, session.user);
    }
  });
}

async function onCloudSignIn(userId: string, user: { user_metadata?: Record<string, unknown>; email?: string }): Promise<void> {
  cloudUserId = userId;

  // Perfil: gana el de mayor progreso (bpXp) y se re-sincronizan ambos lados.
  const record = await fetchCloudRecord(userId);
  profile = resolveProfiles(profile, record?.profile ?? null);
  profile.userId = userId;
  applyCosmetics(profile);
  persistProfile();

  if (record?.username) {
    // Ya tiene nombre único: es su identidad, manda sobre lo local.
    settings.name = record.username;
    await saveSettings(settings);
    setStatus('');
    enterLobby();
    $('lobby-status').textContent = 'Sesión iniciada — perfil sincronizado con la nube';
  } else {
    // Primer login: debe crear su nombre de usuario único.
    openUsernameModal(userId, user);
  }
}

/** Modal obligatorio de creación de nombre único (primer login con Google). */
function openUsernameModal(userId: string, user: { user_metadata?: Record<string, unknown>; email?: string }): void {
  const modal = $('modal-username') as HTMLDialogElement;
  const inputEl = $('username-input') as HTMLInputElement;
  const errorEl = $('username-error');

  const meta = user.user_metadata ?? {};
  const suggested = String(meta.full_name ?? meta.name ?? user.email?.split('@')[0] ?? '')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 16);
  inputEl.value = suggested;
  errorEl.classList.add('hidden');

  modal.addEventListener('cancel', (e) => e.preventDefault()); // obligatorio
  modal.showModal();

  const showError = (msg: string): void => {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  };

  ($('form-username') as HTMLFormElement).onsubmit = async (e) => {
    e.preventDefault();
    const name = inputEl.value.trim();
    if (!/^[a-zA-Z0-9_\-]{3,16}$/.test(name)) {
      showError('Debe tener 3-16 caracteres: letras, números, guiones o guion bajo.');
      return;
    }
    const result = await claimUsername(userId, name, profile);
    if (result === 'taken') {
      showError(`«${name}» ya existe. Elige otro nombre.`);
      return;
    }
    if (result === 'error') {
      showError('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }
    settings.name = name;
    await saveSettings(settings);
    modal.close();
    setStatus('');
    enterLobby();
    $('lobby-status').textContent = `Bienvenido, ${name} — perfil sincronizado con la nube`;
  };
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
  applyOperatorToLobby();
  lobbyMusic.volume = Math.min(settings.volume * 0.35, 1);
  void lobbyMusic.play().catch(() => { /* sin música si falta el asset */ });
  setStatus('');
  if (!connection) {
    connection = new Connection();
    // Reconexión automática: si se cae la conexión en plena partida,
    // al recuperarse el socket re-entramos a la MISMA sala por su código.
    let pendingRejoin: string | null = null;
    connection.onDisconnect = () => {
      if (game) {
        pendingRejoin = connection!.lastRoomCode;
        leaveGame('Conexión perdida — reconectando…');
      }
    };
    connection.onReconnected = () => {
      if (!pendingRejoin) return;
      const code = pendingRejoin;
      pendingRejoin = null;
      setStatus('Reconectado — volviendo a la partida…');
      void startGame(() => connection!.joinByCode(settings.name, code, undefined, joinExtra())).then(() => {
        if (!game) setStatus('La sala ya no existe. Busca una partida nueva.');
      });
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

$('btn-operators').addEventListener('click', () =>
  openOperators(profile, persistProfile, applyOperatorToLobby));

/** El operador del lobby 3D refleja siempre el equipado. */
function applyOperatorToLobby(): void {
  const op = getOperator(profile.equippedOperator);
  lobbyScene?.setOperator(op.accent, op.armor);
}

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

// Botón "Volver" de las pantallas meta → lobby.
for (const btn of document.querySelectorAll('[data-back]')) {
  btn.addEventListener('click', () => {
    showScreen('screen-lobby');
    renderLobbyCard(profile, settings.name);
  });
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
  (form.elements.namedItem('quality') as HTMLSelectElement).value = settings.quality;
}

$('form-settings').addEventListener('submit', () => {
  const form = $('form-settings') as HTMLFormElement;
  settings.sensitivity = Number((form.elements.namedItem('sensitivity') as HTMLInputElement).value);
  settings.fov = Number((form.elements.namedItem('fov') as HTMLInputElement).value);
  settings.volume = Number((form.elements.namedItem('volume') as HTMLInputElement).value);
  settings.quality = (form.elements.namedItem('quality') as HTMLSelectElement).value as typeof settings.quality;
  input.sensitivity = settings.sensitivity;
  audio.setVolume(settings.volume);
  game?.applySettings(settings);
  void saveSettings(settings);
});

// Keep-alive: mientras la pestaña esté abierta, el servidor free de Render
// no se duerme (ping ligero al health check cada 4 minutos).
setInterval(() => {
  const base = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  void fetch(`${base}/health`).catch(() => { /* sin conexión: irrelevante */ });
}, 4 * 60 * 1000);

// Sonido sutil en todos los botones de la interfaz.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) {
    audio.ensureContext();
    audio.playUiClick();
  }
});

// ---------------------------------------------------------------- PWA

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* la PWA es opcional: el juego funciona sin service worker */
  });
}

void init();
