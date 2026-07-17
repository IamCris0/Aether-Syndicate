/**
 * Misiones diarias/semanales y logros — motor 100% data-driven.
 * Una misión es una condición sobre una estadística acumulable; el pool
 * rota de forma determinista por fecha (mismo día ⇒ mismas misiones para
 * todos, sin servidor). Los logros son hitos de por vida sobre el perfil.
 */

/** Estadísticas que una partida puede aportar. */
export type MissionStat = 'kills' | 'assists' | 'headshots' | 'wins' | 'matches' | 'grenadeKills';

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  stat: MissionStat;
  target: number;
  xp: number;
}

/** Pool de misiones diarias (rotan 3 al día). */
export const DAILY_POOL: MissionDef[] = [
  { id: 'd-kills-10', name: 'Cazador', description: 'Consigue 10 bajas', stat: 'kills', target: 10, xp: 300 },
  { id: 'd-kills-20', name: 'Depredador', description: 'Consigue 20 bajas', stat: 'kills', target: 20, xp: 500 },
  { id: 'd-heads-3', name: 'Puntería', description: 'Consigue 3 tiros a la cabeza', stat: 'headshots', target: 3, xp: 350 },
  { id: 'd-assists-5', name: 'Apoyo táctico', description: 'Consigue 5 asistencias', stat: 'assists', target: 5, xp: 300 },
  { id: 'd-win-1', name: 'Dominio orbital', description: 'Gana 1 partida', stat: 'wins', target: 1, xp: 400 },
  { id: 'd-matches-3', name: 'En servicio', description: 'Juega 3 partidas', stat: 'matches', target: 3, xp: 250 },
  { id: 'd-grenades-2', name: 'Demolición', description: 'Elimina a 2 enemigos con granadas', stat: 'grenadeKills', target: 2, xp: 400 },
];

/** Pool semanal (rotan 2 a la semana; objetivos largos). */
export const WEEKLY_POOL: MissionDef[] = [
  { id: 'w-kills-75', name: 'Máquina de guerra', description: 'Consigue 75 bajas esta semana', stat: 'kills', target: 75, xp: 1500 },
  { id: 'w-wins-5', name: 'Racha imparable', description: 'Gana 5 partidas esta semana', stat: 'wins', target: 5, xp: 1800 },
  { id: 'w-heads-15', name: 'Cirujano', description: '15 tiros a la cabeza esta semana', stat: 'headshots', target: 15, xp: 1500 },
  { id: 'w-matches-12', name: 'Veterano activo', description: 'Juega 12 partidas esta semana', stat: 'matches', target: 12, xp: 1200 },
  { id: 'w-grenades-8', name: 'Artillero', description: '8 bajas con granada esta semana', stat: 'grenadeKills', target: 8, xp: 1600 },
];

/** Logros: hitos de por vida sobre las estadísticas del perfil. */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  stat: 'kills' | 'wins' | 'matches' | 'assists';
  target: number;
  xp: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a-kills-25', name: 'Primera sangre', description: '25 bajas totales', stat: 'kills', target: 25, xp: 500 },
  { id: 'a-kills-100', name: 'Centurión', description: '100 bajas totales', stat: 'kills', target: 100, xp: 1000 },
  { id: 'a-kills-500', name: 'Leyenda del Sindicato', description: '500 bajas totales', stat: 'kills', target: 500, xp: 3000 },
  { id: 'a-wins-5', name: 'Ganador', description: '5 victorias', stat: 'wins', target: 5, xp: 600 },
  { id: 'a-wins-25', name: 'Conquistador', description: '25 victorias', stat: 'wins', target: 25, xp: 2000 },
  { id: 'a-matches-10', name: 'Alistado', description: '10 partidas jugadas', stat: 'matches', target: 10, xp: 400 },
  { id: 'a-matches-50', name: 'Curtido en combate', description: '50 partidas jugadas', stat: 'matches', target: 50, xp: 1500 },
  { id: 'a-assists-50', name: 'Hermano de armas', description: '50 asistencias totales', stat: 'assists', target: 50, xp: 800 },
];

/** PRNG determinista para la rotación (mismo seed ⇒ misma selección). */
function pickSeeded<T>(pool: T[], count: number, seed: number): T[] {
  const items = [...pool];
  const picked: T[] = [];
  let s = seed >>> 0;
  while (picked.length < count && items.length > 0) {
    s = (s * 1664525 + 1013904223) >>> 0;
    picked.push(items.splice(s % items.length, 1)[0]);
  }
  return picked;
}

/** Clave del periodo diario (rotación a medianoche local). */
export const dailyKey = (d = new Date()): string =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Clave del periodo semanal (lunes como inicio). */
export const weeklyKey = (d = new Date()): string => {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `w${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
};

const hashKey = (key: string): number => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const dailyMissions = (d = new Date()): MissionDef[] => pickSeeded(DAILY_POOL, 3, hashKey(dailyKey(d)));
export const weeklyMissions = (d = new Date()): MissionDef[] => pickSeeded(WEEKLY_POOL, 2, hashKey(weeklyKey(d)));
