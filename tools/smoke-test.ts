/** Prueba de humo: cliente headless contra el servidor local. */
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', { transports: ['websocket'] });

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  process.exit(1);
};

let seq = 0;
let firstPos: { x: number; y: number; z: number } | null = null;
let lastSnap: any = null;
let snapshots = 0;
let sawGrenade = false;
let sawExplosion = false;

// Uso: tsx tools/smoke-test.ts [mapId] — con mapId crea una sala en ese mapa.
const mapId = process.argv[2];

socket.on('connect', () => {
  socket.emit(
    'join',
    mapId
      ? {
          protocolVersion: 4, playerName: 'SmokeBot', method: 'create', loadout: ['smg-wisp'], level: 7,
          createOptions: { name: `smoke-${mapId}`, maxPlayers: 8, mode: 'ffa', mapId, timeLimitS: 300, scoreLimit: 30, bots: 3, gravityScale: 1 },
        }
      : { protocolVersion: 4, playerName: 'SmokeBot', method: 'matchmake', loadout: ['smg-wisp'], level: 7, operatorId: 'op-vermell' },
    (res: any) => {
      if (!res.ok) fail('join: ' + res.error);
      console.log('JOIN OK:', JSON.stringify(res));

      // Enviar inputs: avanzar y disparar durante ~2s a 60Hz.
      const timer = setInterval(() => {
        const cmds = [];
        for (let i = 0; i < 3; i++) {
          // Fire (bit 3) + Grenade (bit 8): dispara y lanza granadas mientras avanza.
          cmds.push({ seq: ++seq, moveX: 0, moveY: 1, yaw: 0.5, pitch: 0, buttons: (1 << 3) | (1 << 8), weaponSlot: -1 });
        }
        socket.emit('input', cmds);
        if (seq >= 120) clearInterval(timer);
      }, 50);
    },
  );
});

socket.on('sping', (cb: () => void) => cb());

socket.on('snapshot', (snap: any) => {
  snapshots++;
  lastSnap = snap;
  const me = snap.players.find((p: any) => p.id === socket.id);
  if (me && !firstPos) firstPos = { ...me.pos };
  if (snap.grenades?.length > 0) sawGrenade = true;
  if (snap.events?.some((e: any) => e.type === 'explosion')) sawExplosion = true;
});

setTimeout(() => {
  if (!lastSnap) fail('no llegaron snapshots');
  const me = lastSnap.players.find((p: any) => p.id === socket.id);
  if (!me) fail('no aparezco en el snapshot');
  const moved = firstPos && (Math.abs(me.pos.x - firstPos.x) + Math.abs(me.pos.z - firstPos.z)) > 1;
  console.log('snapshots recibidos:', snapshots);
  console.log('ackSeq:', lastSnap.ackSeq, '(enviados', seq, ')');
  console.log('jugadores en sala:', lastSnap.players.length, '(bots incluidos)');
  console.log('pos inicial:', JSON.stringify(firstPos), '→ final:', JSON.stringify(me.pos));
  console.log('munición:', lastSnap.self?.ammo, '/', lastSnap.self?.reserveAmmo, 'recargando:', lastSnap.self?.reloading);
  console.log('vivo:', me.alive, 'salud:', me.health, 'escudo:', me.shield, 'K/D:', me.kills + '/' + me.deaths);
  console.log('granadas vistas en vuelo:', sawGrenade, '· explosión:', sawExplosion, '· restantes:', lastSnap.self?.grenades);
  if (lastSnap.ackSeq === 0) fail('el servidor no procesó ningún input');
  if (!moved) fail('el jugador no se movió');
  if (lastSnap.self.ammo >= 30 && !lastSnap.self.reloading && me.alive) fail('el arma no disparó');
  if (!sawGrenade) fail('no se vio ninguna granada en vuelo');
  if (!sawExplosion) fail('ninguna granada explotó');
  if (me.weaponId !== 'smg-wisp') fail(`loadout de armería no aplicado (arma: ${me.weaponId})`);
  if (me.level !== 7) fail(`nivel no aplicado (nivel: ${me.level})`);
  if (!mapId && me.operatorId !== 'op-vermell') fail(`operador no replicado (${me.operatorId})`);
  console.log('arma equipada:', me.weaponId, '· nivel:', me.level, '· operador:', me.operatorId);
  console.log('SMOKE TEST OK');
  process.exit(0);
}, 4000);

setTimeout(() => fail('timeout'), 10000);
