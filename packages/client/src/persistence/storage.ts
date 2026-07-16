/**
 * Persistencia local con IndexedDB (clave/valor tipado).
 * Guarda ajustes, perfil de invitado y — en el futuro — inventario y
 * progreso offline pendiente de sincronizar con Supabase.
 */

const DB_NAME = 'aether-syndicate';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Ajustes del jugador con valores por defecto. */
export interface PlayerSettings {
  name: string;
  sensitivity: number;
  fov: number;
  volume: number;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  name: '',
  sensitivity: 1,
  fov: 90,
  volume: 0.7,
};

export async function loadSettings(): Promise<PlayerSettings> {
  try {
    const saved = await kvGet<Partial<PlayerSettings>>('settings');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: PlayerSettings): Promise<void> {
  try {
    await kvSet('settings', s);
  } catch {
    /* modo incógnito sin IndexedDB: los ajustes viven solo en memoria */
  }
}
