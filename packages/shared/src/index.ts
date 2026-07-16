/**
 * @aether/shared — código común entre cliente y servidor.
 *
 * Contiene TODO lo que debe comportarse idéntico en ambos lados:
 *  - simulación de movimiento determinista (predicción + autoridad)
 *  - gravedad dinámica y colisiones
 *  - definiciones de armas, modos de juego y mapas
 *  - protocolo de red tipado
 */

export * from './constants.js';
export * from './types.js';
export * from './math/vec3.js';
export * from './protocol/messages.js';
export * from './sim/gravity.js';
export * from './sim/collision.js';
export * from './sim/movement.js';
export * from './data/weapons.js';
export * from './data/gamemodes.js';
export * from './data/progression.js';
export * from './data/maps/index.js';
