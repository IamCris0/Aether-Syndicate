import {
  INPUT_DT,
  MOVE_ADS_MULTIPLIER,
  MOVE_AIR_ACCEL,
  MOVE_CROUCH_MULTIPLIER,
  MOVE_GROUND_ACCEL,
  MOVE_GROUND_FRICTION,
  MOVE_GROUND_SPEED,
  MOVE_JUMP_VELOCITY,
  MOVE_MAX_VELOCITY,
  MOVE_SPRINT_MULTIPLIER,
  MOVE_ZERO_G_DAMPING,
  MOVE_ZERO_G_THRUST,
  PLAYER_CROUCH_HALF_HEIGHT,
  PLAYER_HALF_HEIGHT,
  PLAYER_HALF_WIDTH,
  SLIDE_FRICTION,
  SLIDE_MIN_SPEED,
} from '../constants.js';
import { vec3, viewDirection, type Vec3 } from '../math/vec3.js';
import { moveAABB, type Brush } from './collision.js';
import { gravityAt, type GravityZone } from './gravity.js';
import { Buttons, type InputCommand, type MoveState } from '../types.js';

/**
 * Simulación de movimiento DETERMINISTA y compartida.
 * El cliente la ejecuta para predecir su propio movimiento; el servidor la
 * ejecuta con autoridad. Ambos deben producir exactamente el mismo resultado
 * para el mismo (estado, input), lo que hace posible la reconciliación.
 */

export interface MovementContext {
  brushes: Brush[];
  gravityZones: GravityZone[];
  /** Multiplicador global de gravedad (salas personalizadas). */
  gravityScale: number;
}

const tmpDelta = vec3();
const tmpDir = vec3();

export function playerHalfExtents(crouching: boolean): Vec3 {
  return vec3(PLAYER_HALF_WIDTH, crouching ? PLAYER_CROUCH_HALF_HEIGHT : PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH);
}

/** Aplica un comando de input sobre un estado de movimiento (muta `state`). */
export function stepMovement(state: MoveState, input: InputCommand, ctx: MovementContext): void {
  const dt = INPUT_DT;
  const g = gravityAt(ctx.gravityZones, state.pos, ctx.gravityScale);
  const zeroG = Math.abs(g) < 0.5;

  state.crouching = !zeroG && (input.buttons & Buttons.Crouch) !== 0;

  if (zeroG) {
    stepZeroG(state, input, dt);
  } else {
    stepGrounded(state, input, ctx, dt, g);
  }

  // Limitar velocidad total por seguridad numérica.
  const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z);
  if (speed > MOVE_MAX_VELOCITY) {
    const k = MOVE_MAX_VELOCITY / speed;
    state.vel.x *= k;
    state.vel.y *= k;
    state.vel.z *= k;
  }

  // Integración + colisión.
  tmpDelta.x = state.vel.x * dt;
  tmpDelta.y = state.vel.y * dt;
  tmpDelta.z = state.vel.z * dt;

  const half = playerHalfExtents(state.crouching);
  const res = moveAABB(state.pos, half, tmpDelta, ctx.brushes);

  if (res.hitX) state.vel.x = 0;
  if (res.hitZ) state.vel.z = 0;
  if (res.hitY) {
    // Suelo "real" según la dirección de la gravedad (soporta invertida).
    const groundSide = g <= 0 ? 1 : -1;
    state.onGround = res.groundNormalY === groundSide;
    state.vel.y = 0;
  } else {
    state.onGround = false;
  }
}

function stepGrounded(state: MoveState, input: InputCommand, ctx: MovementContext, dt: number, g: number): void {
  // Dirección deseada en el plano XZ según el yaw.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wishX = input.moveX * cos - input.moveY * sin;
  let wishZ = -input.moveY * cos - input.moveX * sin;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-6) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const sprinting = (input.buttons & Buttons.Sprint) !== 0 && input.moveY > 0.1 && !state.crouching;
  let targetSpeed = MOVE_GROUND_SPEED;
  if (sprinting) targetSpeed *= MOVE_SPRINT_MULTIPLIER;
  if (state.crouching) targetSpeed *= MOVE_CROUCH_MULTIPLIER;
  if ((input.buttons & Buttons.Aim) !== 0) targetSpeed *= MOVE_ADS_MULTIPLIER;

  // SLIDE: agachado en el suelo por encima de la velocidad de sprint se desliza
  // conservando el momento (fricción mínima, sin aceleración de input).
  const groundSpeed = Math.hypot(state.vel.x, state.vel.z);
  const sliding = state.crouching && state.onGround && groundSpeed > SLIDE_MIN_SPEED;

  if (state.onGround) {
    // Fricción (reducida durante el slide).
    const friction = sliding ? SLIDE_FRICTION : MOVE_GROUND_FRICTION;
    if (groundSpeed > 1e-4) {
      const drop = groundSpeed * friction * dt;
      const k = Math.max(groundSpeed - drop, 0) / groundSpeed;
      state.vel.x *= k;
      state.vel.z *= k;
    }
  }

  // Aceleración estilo quake: solo hasta la velocidad objetivo en la dirección deseada.
  if (wishLen > 1e-6 && !sliding) {
    const accel = state.onGround ? MOVE_GROUND_ACCEL : MOVE_AIR_ACCEL;
    const current = state.vel.x * wishX + state.vel.z * wishZ;
    const addSpeed = targetSpeed - current;
    if (addSpeed > 0) {
      const accelSpeed = Math.min(accel * dt * targetSpeed, addSpeed);
      state.vel.x += wishX * accelSpeed;
      state.vel.z += wishZ * accelSpeed;
    }
  }

  // Salto (en gravedad invertida se salta "hacia abajo" relativo al mundo).
  if ((input.buttons & Buttons.Jump) !== 0 && state.onGround) {
    state.vel.y = g <= 0 ? MOVE_JUMP_VELOCITY : -MOVE_JUMP_VELOCITY;
    state.onGround = false;
  }

  state.vel.y += g * dt;
}

function stepZeroG(state: MoveState, input: InputCommand, dt: number): void {
  // Vuelo 6-DOF: WASD relativo a la vista completa, salto/agacharse = subir/bajar.
  viewDirection(tmpDir, input.yaw, input.pitch);
  const fwdX = tmpDir.x;
  const fwdY = tmpDir.y;
  const fwdZ = tmpDir.z;
  const rightX = Math.cos(input.yaw);
  const rightZ = -Math.sin(input.yaw);

  let ax = fwdX * input.moveY + rightX * input.moveX;
  let ay = fwdY * input.moveY;
  let az = fwdZ * input.moveY + rightZ * input.moveX;

  if ((input.buttons & Buttons.Jump) !== 0) ay += 1;
  if ((input.buttons & Buttons.Crouch) !== 0) ay -= 1;

  const len = Math.hypot(ax, ay, az);
  if (len > 1e-6) {
    const boost = (input.buttons & Buttons.Sprint) !== 0 ? 1.5 : 1;
    const k = (MOVE_ZERO_G_THRUST * boost * dt) / len;
    state.vel.x += ax * k;
    state.vel.y += ay * k;
    state.vel.z += az * k;
  }

  // Amortiguación suave para que el vuelo sea controlable pero con inercia.
  const damp = Math.exp(-MOVE_ZERO_G_DAMPING * dt);
  state.vel.x *= damp;
  state.vel.y *= damp;
  state.vel.z *= damp;
  state.onGround = false;
}
