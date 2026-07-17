import * as THREE from 'three';

/**
 * Rig procedural del operador (casco con visor emisivo, placas, hombreras,
 * piernas y luces de corporación). Lo usan los avatares in-game; el color
 * de acento identifica al equipo. Origen en los PIES (y=0), altura ~1.84.
 */
export function buildOperator(accentColor: number, armorColor = 0x232d40): THREE.Group {
  const rig = new THREE.Group();

  const armor = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.45, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141b29, roughness: 0.7, metalness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({
    color: accentColor, emissive: accentColor, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.3,
  });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    rig.add(m);
  };

  // Piernas y botas
  add(new THREE.BoxGeometry(0.16, 0.5, 0.18), dark, -0.12, 0.25, 0);
  add(new THREE.BoxGeometry(0.16, 0.5, 0.18), dark, 0.12, 0.25, 0);
  add(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, -0.12, 0.7, 0);
  add(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, 0.12, 0.7, 0);
  add(new THREE.BoxGeometry(0.19, 0.12, 0.26), dark, -0.12, 0.06, 0.02);
  add(new THREE.BoxGeometry(0.19, 0.12, 0.26), dark, 0.12, 0.06, 0.02);

  // Torso, placa pectoral y franja emisiva
  add(new THREE.BoxGeometry(0.46, 0.55, 0.26), armor, 0, 1.18, 0);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.08), dark, 0, 1.24, -0.15);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.02), glow, 0, 1.2, -0.19);
  add(new THREE.BoxGeometry(0.48, 0.14, 0.28), dark, 0, 0.88, 0);

  // Hombreras
  add(new THREE.BoxGeometry(0.18, 0.14, 0.24), armor, -0.32, 1.4, 0, 0.25);
  add(new THREE.BoxGeometry(0.18, 0.14, 0.24), armor, 0.32, 1.4, 0, -0.25);

  // Brazos (el derecho adelantado sujetando el arma)
  add(new THREE.BoxGeometry(0.12, 0.42, 0.14), dark, -0.33, 1.1, 0, 0.08);
  add(new THREE.BoxGeometry(0.12, 0.14, 0.34), dark, 0.3, 1.22, -0.2, 0);

  // Casco con visor emisivo
  add(new THREE.BoxGeometry(0.3, 0.32, 0.32), armor, 0, 1.66, 0);
  add(new THREE.BoxGeometry(0.24, 0.1, 0.06), glow, 0, 1.68, -0.16);
  add(new THREE.BoxGeometry(0.32, 0.08, 0.3), dark, 0, 1.83, 0);

  // Arma genérica en las manos
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.5, metalness: 0.8 });
  add(new THREE.BoxGeometry(0.09, 0.11, 0.55), gunMat, 0.24, 1.24, -0.42);
  add(new THREE.BoxGeometry(0.04, 0.04, 0.2), gunMat, 0.24, 1.27, -0.75);

  return rig;
}
