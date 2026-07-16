import { Buttons } from '@aether/shared';

/**
 * Captura de teclado/ratón con Pointer Lock.
 * Traduce el estado crudo a (moveX, moveY, buttons, yaw, pitch) que consume
 * el generador de InputCommands. Sin dependencias del renderer ni de la red.
 */
export class Input {
  yaw = 0;
  pitch = 0;
  sensitivity = 1;

  /** Slot solicitado con las teclas 1..3 (se consume una vez). */
  private requestedSlot = -1;
  private keys = new Set<string>();
  private mouseDown = false;
  private mouse2Down = false;
  private locked = false;

  onPointerLockChange: ((locked: boolean) => void) | null = null;
  onToggleScoreboard: ((show: boolean) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        this.onToggleScoreboard?.(true);
      }
      if (e.code === 'Digit1') this.requestedSlot = 0;
      if (e.code === 'Digit2') this.requestedSlot = 1;
      if (e.code === 'Digit3') this.requestedSlot = 2;
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') this.onToggleScoreboard?.(false);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouse2Down = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouse2Down = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const k = 0.0022 * this.sensitivity;
      this.yaw -= e.movementX * k;
      this.pitch -= e.movementY * k;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.keys.clear();
        this.mouseDown = false;
      }
      this.onPointerLockChange?.(this.locked);
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  release(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Solicita la captura del puntero (debe llamarse desde un gesto del usuario). */
  lock(): void {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  sample(): { moveX: number; moveY: number; buttons: number; weaponSlot: number } {
    let moveX = 0;
    let moveY = 0;
    if (this.keys.has('KeyW')) moveY += 1;
    if (this.keys.has('KeyS')) moveY -= 1;
    if (this.keys.has('KeyA')) moveX -= 1;
    if (this.keys.has('KeyD')) moveX += 1;

    let buttons = 0;
    if (this.keys.has('Space')) buttons |= Buttons.Jump;
    if (this.keys.has('ShiftLeft')) buttons |= Buttons.Sprint;
    if (this.keys.has('ControlLeft') || this.keys.has('KeyC')) buttons |= Buttons.Crouch;
    if (this.keys.has('KeyR')) buttons |= Buttons.Reload;
    if (this.keys.has('KeyE')) buttons |= Buttons.Interact;
    if (this.keys.has('KeyV')) buttons |= Buttons.Melee;
    if (this.keys.has('KeyG')) buttons |= Buttons.Grenade;
    if (this.mouseDown) buttons |= Buttons.Fire;
    if (this.mouse2Down) buttons |= Buttons.Aim;

    const weaponSlot = this.requestedSlot;
    this.requestedSlot = -1;
    return { moveX, moveY, buttons, weaponSlot };
  }
}
