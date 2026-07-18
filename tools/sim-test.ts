/**
 * Test determinista de la simulación compartida (sin red ni render).
 * Uso: npx tsx tools/sim-test.ts
 * Verifica el contrato del movimiento: velocidades objetivo, salto, coyote
 * time, topes del campo de flotación y gravedad invertida.
 */
import {
  Buttons,
  FLOAT_HMAX,
  FLOAT_VMAX,
  INPUT_DT,
  MOVE_GROUND_SPEED,
  MOVE_SPRINT_MULTIPLIER,
  stepMovement,
  vec3,
  type InputCommand,
  type MoveState,
  type MovementContext,
} from '../packages/shared/src/index.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? '✓' : '✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const cmd = (over: Partial<InputCommand> = {}): InputCommand => ({
  seq: 0, moveX: 0, moveY: 0, yaw: 0, pitch: 0, buttons: 0, weaponSlot: -1, ...over,
});

const freshState = (y = 1.5): MoveState => ({
  pos: vec3(0, y, 0), vel: vec3(), onGround: false, crouching: false, airTime: 0,
});

/** Mundo plano: suelo infinito en y=0. */
const flatCtx = (gravityScale = 1): MovementContext => ({
  brushes: [{ min: vec3(-500, -1, -500), max: vec3(500, 0, 500) }],
  gravityZones: [],
  gravityScale,
});

/** Mundo con zona de flotación global. */
const floatCtx = (): MovementContext => ({
  brushes: [{ min: vec3(-500, -1, -500), max: vec3(500, 0, 500) }],
  gravityZones: [{ id: 'z', kind: 'zero', min: vec3(-500, 0, -500), max: vec3(500, 100, 500), priority: 1 }],
  gravityScale: 1,
});

const run = (state: MoveState, input: InputCommand, ctx: MovementContext, steps: number): void => {
  for (let i = 0; i < steps; i++) stepMovement(state, input, ctx);
};

// ---- 1. Velocidad en tierra ----
{
  const s = freshState();
  run(s, cmd({ moveY: 1 }), flatCtx(), 120); // 2s andando
  const speed = Math.hypot(s.vel.x, s.vel.z);
  check('andar alcanza ~velocidad objetivo', Math.abs(speed - MOVE_GROUND_SPEED) < 0.4, `v=${speed.toFixed(2)}`);
  check('andar no supera el objetivo', speed <= MOVE_GROUND_SPEED + 0.2, `v=${speed.toFixed(2)}`);
}

// ---- 2. Sprint ----
{
  const s = freshState();
  run(s, cmd({ moveY: 1, buttons: Buttons.Sprint }), flatCtx(), 120);
  const speed = Math.hypot(s.vel.x, s.vel.z);
  const target = MOVE_GROUND_SPEED * MOVE_SPRINT_MULTIPLIER;
  check('sprint alcanza su objetivo', Math.abs(speed - target) < 0.5, `v=${speed.toFixed(2)} vs ${target.toFixed(2)}`);
}

// ---- 3. Salto y aterrizaje ----
{
  const s = freshState();
  run(s, cmd(), flatCtx(), 30); // asentar en el suelo
  check('asienta en el suelo', s.onGround);
  stepMovement(s, cmd({ buttons: Buttons.Jump }), flatCtx());
  check('el salto despega', !s.onGround && s.vel.y > 5, `vy=${s.vel.y.toFixed(2)}`);
  run(s, cmd(), flatCtx(), 90); // 1.5s: sube y cae
  check('aterriza tras el salto', s.onGround);
}

// ---- 4. Coyote time ----
{
  const s = freshState();
  run(s, cmd(), flatCtx(), 30);
  // Simular pisar el vacío: quitar el suelo unos pasos
  const noFloor: MovementContext = { brushes: [], gravityZones: [], gravityScale: 1 };
  run(s, cmd(), noFloor, 4); // ~0.066s en el aire
  stepMovement(s, cmd({ buttons: Buttons.Jump }), noFloor);
  check('coyote: salta tras pisar el vacío (<0.12s)', s.vel.y > 5, `vy=${s.vel.y.toFixed(2)}`);
  const s2 = freshState();
  run(s2, cmd(), flatCtx(), 30);
  run(s2, cmd(), noFloor, 12); // 0.2s: coyote expirado
  const vyAntes = s2.vel.y;
  stepMovement(s2, cmd({ buttons: Buttons.Jump }), noFloor);
  check('coyote expirado: NO salta a 0.2s', s2.vel.y < vyAntes + 1, `vy=${s2.vel.y.toFixed(2)}`);
}

// ---- 5. Flotación: tope de entrada ----
{
  const s = freshState(5);
  s.vel.x = 25; // entra disparado (el bug reportado)
  run(s, cmd({ moveY: 1 }), floatCtx(), 60);
  const h = Math.hypot(s.vel.x, s.vel.z);
  check('flotación doma el momento de entrada', h <= FLOAT_HMAX + 0.01, `h=${h.toFixed(2)} (tope ${FLOAT_HMAX})`);
}

// ---- 6. Flotación: pararse en el aire ----
{
  const s = freshState(8);
  s.vel.x = 8;
  s.vel.y = 4;
  run(s, cmd(), floatCtx(), 90); // 1.5s sin input
  const total = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  check('flotación frena al soltar (se para en el aire)', total < 1.2, `|v|=${total.toFixed(2)}`);
}

// ---- 7. Flotación: ascenso con tope ----
{
  const s = freshState(3);
  run(s, cmd({ buttons: Buttons.Jump }), floatCtx(), 90);
  check('flotación asciende con Espacio', s.pos.y > 5, `y=${s.pos.y.toFixed(2)}`);
  check('ascenso respeta el tope vertical', s.vel.y <= FLOAT_VMAX + 0.01, `vy=${s.vel.y.toFixed(2)}`);
}

// ---- 8. Gravedad invertida: cae hacia ARRIBA y aterriza en el techo ----
{
  const ctx: MovementContext = {
    brushes: [
      { min: vec3(-50, -1, -50), max: vec3(50, 0, 50) }, // suelo
      { min: vec3(-50, 10, -50), max: vec3(50, 11, 50) }, // techo
    ],
    gravityZones: [{ id: 'inv', kind: 'inverted', min: vec3(-50, 0, -50), max: vec3(50, 10, 50), priority: 1 }],
    gravityScale: 1,
  };
  const s = freshState(2);
  run(s, cmd(), ctx, 120);
  check('invertida: aterriza en el techo', s.onGround && s.pos.y > 8, `y=${s.pos.y.toFixed(2)}`);
  stepMovement(s, cmd({ buttons: Buttons.Jump }), ctx);
  check('invertida: salta hacia abajo', s.vel.y < -5, `vy=${s.vel.y.toFixed(2)}`);
}

console.log(failures === 0 ? '\nSIM TEST OK (todas las comprobaciones pasan)' : `\nSIM TEST: ${failures} fallo(s)`);
process.exit(failures === 0 ? 0 : 1);
