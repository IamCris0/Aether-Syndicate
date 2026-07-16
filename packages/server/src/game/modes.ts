import { GUNGAME_ORDER, getGameMode, type GameModeDef, type GameModeId, type TeamId } from '@aether/shared';
import type { PlayerEntity } from './PlayerEntity.js';

/**
 * Hooks de modo de juego. La lógica común (respawns, tiempo, snapshots)
 * vive en GameRoom; cada modo solo decide puntuación, equipos y condiciones
 * de victoria. Añadir un modo nuevo = implementar esta interfaz y registrarla.
 */

export interface MatchState {
  scoreTeam0: number;
  scoreTeam1: number;
  over: boolean;
  winnerId: string | null;
  winnerTeam: TeamId | null;
}

export interface GameModeLogic {
  readonly def: GameModeDef;
  assignTeam(players: PlayerEntity[]): TeamId;
  onKill(killer: PlayerEntity, victim: PlayerEntity, match: MatchState, scoreLimit: number): void;
  onTimeUp(players: PlayerEntity[], match: MatchState): void;
  /** Loadout inicial (Gun Game lo dicta el modo). */
  loadoutFor(player: PlayerEntity): string[] | null;
}

class FreeForAll implements GameModeLogic {
  readonly def = getGameMode('ffa');

  assignTeam(): TeamId {
    return 2;
  }

  onKill(killer: PlayerEntity, _victim: PlayerEntity, match: MatchState, scoreLimit: number): void {
    killer.score = killer.kills;
    if (killer.kills >= scoreLimit) {
      match.over = true;
      match.winnerId = killer.id;
    }
  }

  onTimeUp(players: PlayerEntity[], match: MatchState): void {
    match.over = true;
    const top = [...players].sort((a, b) => b.kills - a.kills)[0];
    match.winnerId = top ? top.id : null;
  }

  loadoutFor(): string[] | null {
    return null;
  }
}

class TeamDeathmatch implements GameModeLogic {
  readonly def = getGameMode('tdm');

  assignTeam(players: PlayerEntity[]): TeamId {
    const t0 = players.filter((p) => p.team === 0).length;
    const t1 = players.filter((p) => p.team === 1).length;
    return t0 <= t1 ? 0 : 1;
  }

  onKill(killer: PlayerEntity, victim: PlayerEntity, match: MatchState, scoreLimit: number): void {
    if (killer.team === victim.team) return; // sin puntos por fuego amigo
    if (killer.team === 0) match.scoreTeam0++;
    if (killer.team === 1) match.scoreTeam1++;
    if (match.scoreTeam0 >= scoreLimit || match.scoreTeam1 >= scoreLimit) {
      match.over = true;
      match.winnerTeam = match.scoreTeam0 > match.scoreTeam1 ? 0 : 1;
    }
  }

  onTimeUp(_players: PlayerEntity[], match: MatchState): void {
    match.over = true;
    match.winnerTeam = match.scoreTeam0 === match.scoreTeam1 ? null : match.scoreTeam0 > match.scoreTeam1 ? 0 : 1;
  }

  loadoutFor(): string[] | null {
    return null;
  }
}

class GunGame implements GameModeLogic {
  readonly def = getGameMode('gungame');

  assignTeam(): TeamId {
    return 2;
  }

  onKill(killer: PlayerEntity, _victim: PlayerEntity, match: MatchState, _scoreLimit: number): void {
    killer.gungameIndex++;
    if (killer.gungameIndex >= GUNGAME_ORDER.length) {
      match.over = true;
      match.winnerId = killer.id;
      return;
    }
    killer.equipLoadout([GUNGAME_ORDER[killer.gungameIndex]]);
  }

  onTimeUp(players: PlayerEntity[], match: MatchState): void {
    match.over = true;
    const top = [...players].sort((a, b) => b.gungameIndex - a.gungameIndex)[0];
    match.winnerId = top ? top.id : null;
  }

  loadoutFor(player: PlayerEntity): string[] | null {
    return [GUNGAME_ORDER[Math.min(player.gungameIndex, GUNGAME_ORDER.length - 1)]];
  }
}

const REGISTRY: Partial<Record<GameModeId, () => GameModeLogic>> = {
  ffa: () => new FreeForAll(),
  tdm: () => new TeamDeathmatch(),
  gungame: () => new GunGame(),
  custom: () => new FreeForAll(),
};

/** Modos aún no implementados degradan a FFA con aviso en logs. */
export function createModeLogic(id: GameModeId): GameModeLogic {
  const factory = REGISTRY[id];
  if (!factory) {
    console.warn(`[modes] '${id}' aún no implementado; usando FFA`);
    return new FreeForAll();
  }
  return factory();
}
