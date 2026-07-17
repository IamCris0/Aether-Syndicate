import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BrushMaterial, MapDef } from '@aether/shared';

export type WorldQuality = 'low' | 'medium' | 'high';

/**
 * Construye la escena visual de un mapa a partir de sus brushes.
 * La malla visual se deriva de la MISMA geometría que usa la colisión,
 * de modo que lo que ves es exactamente contra lo que chocas.
 *
 * Optimización: los brushes se FUSIONAN en una sola malla por material
 * (~80 draw calls → ~6), y la densidad de partículas escala con la calidad.
 */
export class World {
  readonly group = new THREE.Group();
  /** Material emisivo de paneles/reactores (el cliente lo hace pulsar). */
  accentMaterial: THREE.MeshStandardMaterial;

  constructor(readonly map: MapDef, quality: WorldQuality = 'high') {
    const materials = createMaterials();
    this.accentMaterial = materials.accent as THREE.MeshStandardMaterial;
    const particleScale = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;

    // Agrupar la geometría de los brushes por material y fusionarla.
    const byMaterial = new Map<BrushMaterial, THREE.BufferGeometry[]>();
    for (const brush of map.brushes) {
      if (brush.material === 'invisible') continue;
      const sx = brush.max.x - brush.min.x;
      const sy = brush.max.y - brush.min.y;
      const sz = brush.max.z - brush.min.z;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      geo.translate(brush.min.x + sx / 2, brush.min.y + sy / 2, brush.min.z + sz / 2);
      let list = byMaterial.get(brush.material);
      if (!list) byMaterial.set(brush.material, (list = []));
      list.push(geo);
    }
    for (const [material, geos] of byMaterial) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      for (const g of geos) g.dispose();
      this.group.add(new THREE.Mesh(merged, materials[material]));
    }

    // Volúmenes de gravedad: hint visual sutil (niebla de partículas estáticas).
    for (const zone of map.gravityZones) {
      const sx = zone.max.x - zone.min.x;
      const sy = zone.max.y - zone.min.y;
      const sz = zone.max.z - zone.min.z;
      const color = zone.kind === 'zero' ? 0x38e0c8 : zone.kind === 'low' ? 0x5f8cff : 0xffa640;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.045, depthWrite: false }),
      );
      box.position.set(zone.min.x + sx / 2, zone.min.y + sy / 2, zone.min.z + sz / 2);
      this.group.add(box);

      const motes = createMotes(zone.min, zone.max, Math.floor(sx * sy * sz * 0.01 * particleScale), color);
      this.group.add(motes);
    }

    // Luces del mapa.
    for (const l of map.lights) {
      if (l.type === 'ambient') {
        this.group.add(new THREE.AmbientLight(l.color, l.intensity));
      } else if (l.type === 'directional') {
        const light = new THREE.DirectionalLight(l.color, l.intensity);
        if (l.pos) light.position.set(l.pos.x, l.pos.y, l.pos.z);
        this.group.add(light);
      } else if (l.pos) {
        const light = new THREE.PointLight(l.color, l.intensity, 60, 1.8);
        light.position.set(l.pos.x, l.pos.y, l.pos.z);
        this.group.add(light);
      }
    }

    this.group.add(createStarfield(Math.floor(1500 * particleScale)));
  }
}

/**
 * Aplica una textura generada (pipeline Higgsfield) a un material si existe;
 * si falta el fichero, el material conserva su color procedural (fallback).
 */
function tryTexture(mat: THREE.MeshStandardMaterial, url: string, repeat: number): void {
  new THREE.TextureLoader().load(url, (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  });
}

function createMaterials(): Record<BrushMaterial, THREE.Material> {
  const floor = new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.9, metalness: 0.4 });
  const hull = new THREE.MeshStandardMaterial({ color: 0x39465c, roughness: 0.75, metalness: 0.6 });
  const catwalk = new THREE.MeshStandardMaterial({ color: 0x4a5670, roughness: 0.6, metalness: 0.8 });

  const accent = new THREE.MeshStandardMaterial({
    color: 0x1c2740, roughness: 0.5, metalness: 0.7, emissive: 0x38e0c8, emissiveIntensity: 0.18,
  });
  const rock = new THREE.MeshStandardMaterial({ color: 0x554f4a, roughness: 1, metalness: 0.05 });

  tryTexture(floor, '/assets/textures/floor-deck-01.jpg', 10);
  tryTexture(hull, '/assets/textures/hull-wall-01.jpg', 6);
  tryTexture(catwalk, '/assets/textures/catwalk-01.jpg', 8);
  tryTexture(accent, '/assets/textures/accent-panel-01.jpg', 4);
  tryTexture(rock, '/assets/textures/rock-01.jpg', 5);

  return {
    hull,
    floor,
    glass: new THREE.MeshStandardMaterial({
      color: 0x7fd0ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.28,
    }),
    accent,
    catwalk,
    rock,
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
  };
}

function createMotes(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }, count: number, color: number): THREE.Points {
  const n = Math.min(Math.max(count, 40), 400);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = min.x + Math.random() * (max.x - min.x);
    positions[i * 3 + 1] = min.y + Math.random() * (max.y - min.y);
    positions[i * 3 + 2] = min.z + Math.random() * (max.z - min.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.06, transparent: true, opacity: 0.5 }));
}

function createStarfield(n: number): THREE.Points {
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 400 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd9ff, size: 0.9, sizeAttenuation: true }));
}
