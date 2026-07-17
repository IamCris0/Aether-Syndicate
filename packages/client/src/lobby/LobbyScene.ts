import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Lobby 3D estilo vestidor (Fortnite-like): el operador equipado renderizado
 * en tiempo real sobre un podio con iluminación cinematográfica.
 *
 * El modelo del operador tiene dos rutas:
 *  1. GLB en /assets/models/operator.glb (generado con image_to_3d) — preferido.
 *  2. Operador PROCEDURAL construido con primitivas — fallback garantizado,
 *     mismo lenguaje visual que los avatares in-game pero con más detalle.
 */
export class LobbyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private operator = new THREE.Group();
  private podiumRing: THREE.Mesh;
  private running = false;
  private time = 0;
  private mouseX = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    this.camera.position.set(0.15, 1.35, 3.4);
    this.camera.lookAt(0, 1.0, 0);

    // ---- Iluminación cinematográfica (key teal / rim cian / fill azul) ----
    this.scene.add(new THREE.AmbientLight(0x18243a, 1.4));
    const key = new THREE.DirectionalLight(0xd8ecff, 2.6);
    key.position.set(2.5, 3.5, 2.5);
    const rim = new THREE.DirectionalLight(0x38e0c8, 3.2);
    rim.position.set(-2.6, 2.2, -2.4);
    const fill = new THREE.PointLight(0x5f8cff, 18, 12, 1.8);
    fill.position.set(-1.6, 1.2, 2.2);
    this.scene.add(key, rim, fill);

    // ---- Podio ----
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x1a2334, roughness: 0.4, metalness: 0.8 }),
    );
    podium.position.y = -0.08;
    this.podiumRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.025, 12, 64),
      new THREE.MeshStandardMaterial({
        color: 0x38e0c8, emissive: 0x38e0c8, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.2,
      }),
    );
    this.podiumRing.rotation.x = Math.PI / 2;
    this.podiumRing.position.y = 0.01;
    this.scene.add(podium, this.podiumRing);

    // ---- Suelo reflectante sutil + niebla ----
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x060a14, roughness: 0.25, metalness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.17;
    this.scene.add(ground);
    this.scene.fog = new THREE.FogExp2(0x04070f, 0.055);

    // ---- Operador: GLB si existe, procedural si no ----
    this.scene.add(this.operator);
    this.buildProceduralOperator();
    new GLTFLoader().load(
      '/assets/models/operator.glb',
      (gltf) => {
        this.operator.clear();
        const model = gltf.scene;
        // Normalizar altura a ~1.85 m sobre el podio.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.85 / Math.max(size.y, 0.001);
        model.scale.setScalar(scale);
        box.setFromObject(model);
        model.position.y -= box.min.y;
        this.operator.add(model);
      },
      undefined,
      () => { /* sin GLB: se mantiene el operador procedural */ },
    );

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
    });
  }

  /** Operador construido con primitivas: casco, visor emisivo, placas, luces. */
  private buildProceduralOperator(): void {
    const armor = new THREE.MeshStandardMaterial({ color: 0x232d40, roughness: 0.45, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141b29, roughness: 0.7, metalness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x38e0c8, emissive: 0x38e0c8, emissiveIntensity: 1.8, roughness: 0.3, metalness: 0.3,
    });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      this.operator.add(m);
      return m;
    };

    // Piernas y botas
    add(new THREE.BoxGeometry(0.16, 0.5, 0.18), dark, -0.12, 0.25, 0);
    add(new THREE.BoxGeometry(0.16, 0.5, 0.18), dark, 0.12, 0.25, 0);
    add(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, -0.12, 0.7, 0);
    add(new THREE.BoxGeometry(0.18, 0.42, 0.2), armor, 0.12, 0.7, 0);
    add(new THREE.BoxGeometry(0.19, 0.12, 0.26), dark, -0.12, 0.06, 0.02);
    add(new THREE.BoxGeometry(0.19, 0.12, 0.26), dark, 0.12, 0.06, 0.02);

    // Torso con placa pectoral y franja emisiva
    add(new THREE.BoxGeometry(0.46, 0.55, 0.26), armor, 0, 1.18, 0);
    add(new THREE.BoxGeometry(0.4, 0.34, 0.08), dark, 0, 1.24, 0.15);
    add(new THREE.BoxGeometry(0.05, 0.3, 0.02), glow, 0, 1.2, 0.2);
    add(new THREE.BoxGeometry(0.48, 0.14, 0.28), dark, 0, 0.88, 0);

    // Hombreras
    add(new THREE.BoxGeometry(0.18, 0.14, 0.24), armor, -0.32, 1.4, 0, 0.25);
    add(new THREE.BoxGeometry(0.18, 0.14, 0.24), armor, 0.32, 1.4, 0, -0.25);

    // Brazos
    add(new THREE.BoxGeometry(0.12, 0.42, 0.14), dark, -0.33, 1.1, 0, 0.08);
    add(new THREE.BoxGeometry(0.12, 0.42, 0.14), dark, 0.33, 1.1, 0, -0.08);
    add(new THREE.BoxGeometry(0.11, 0.3, 0.13), armor, -0.36, 0.78, 0.04);
    add(new THREE.BoxGeometry(0.11, 0.3, 0.13), armor, 0.36, 0.78, 0.04);

    // Casco con visor emisivo y detalles
    add(new THREE.BoxGeometry(0.3, 0.32, 0.32), armor, 0, 1.66, 0);
    add(new THREE.BoxGeometry(0.24, 0.1, 0.06), glow, 0, 1.68, 0.16);
    add(new THREE.BoxGeometry(0.32, 0.08, 0.3), dark, 0, 1.83, 0);
    add(new THREE.BoxGeometry(0.04, 0.05, 0.04), glow, -0.16, 1.62, 0.08);
    add(new THREE.BoxGeometry(0.04, 0.05, 0.04), glow, 0.16, 1.62, 0.08);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    window.addEventListener('resize', this.resize);
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    window.removeEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = (): void => {
    if (!this.running) return;
    this.time += 1 / 60;

    // Rotación lenta + parallax hacia el cursor + respiración.
    const targetYaw = Math.sin(this.time * 0.25) * 0.35 + this.mouseX * 0.3;
    this.operator.rotation.y += (targetYaw - this.operator.rotation.y) * 0.04;
    this.operator.position.y = Math.sin(this.time * 1.6) * 0.012;
    this.podiumRing.material = this.podiumRing.material; // (sin cambios; el anillo pulsa vía intensidad)
    (this.podiumRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.9 + Math.sin(this.time * 2.2) * 0.5;

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
