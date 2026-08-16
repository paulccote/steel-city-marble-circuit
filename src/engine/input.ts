import * as THREE from 'three';

export interface InputState {
  forward: number;
  right: number;
  jump: boolean;
  brake: boolean;
  usePowerup: boolean;
  /** Accumulated mouse delta since the last read, in radians. */
  yawDelta: number;
  pitchDelta: number;
}

const KEY_MAP: Record<string, keyof typeof AXES | 'jump' | 'brake' | 'use' | 'restart'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'brake',
  KeyE: 'use',
  KeyR: 'restart',
};

const AXES = { up: 0, down: 0, left: 0, right: 0 };

export class Input {
  readonly state: InputState = {
    forward: 0,
    right: 0,
    jump: false,
    brake: false,
    usePowerup: false,
    yawDelta: 0,
    pitchDelta: 0,
  };

  /** Marble Blast maps its sensitivity slider onto lerp(1/2500, 1/100, s). */
  sensitivity = 0.0038;
  invertY = false;

  private keys = new Set<string>();
  private mouseJump = false;
  private mouseBrake = false;
  private pointerLocked = false;
  private onRestart: (() => void) | null = null;
  private canvas: HTMLElement;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setRestartHandler(fn: () => void) {
    this.onRestart = fn;
  }

  requestLock() {
    if (this.pointerLocked) return;
    // Chrome rejects for about a second after a user-initiated Escape, and an
    // unhandled rejection there would surface as a console error mid-game.
    const result = this.canvas.requestPointerLock?.() as Promise<void> | undefined;
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  releaseLock() {
    if (this.pointerLocked) document.exitPointerLock?.();
  }

  get locked() {
    return this.pointerLocked;
  }

  private handleLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private handleMouseDown = (e: MouseEvent) => {
    this.requestLock();
    // Left click jumps and right click brakes, matching Marble Blast, so the
    // hands never have to leave mouse + WASD.
    if (e.button === 0) this.mouseJump = true;
    if (e.button === 2) this.mouseBrake = true;
    this.sync();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseJump = false;
    if (e.button === 2) this.mouseBrake = false;
    this.sync();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    // Positive pitch looks down, so raw movementY maps straight through.
    this.state.yawDelta -= e.movementX * this.sensitivity;
    this.state.pitchDelta += (this.invertY ? -e.movementY : e.movementY) * this.sensitivity;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (this.keys.has(e.code)) return;
    this.keys.add(e.code);
    if (action === 'restart') this.onRestart?.();
    this.sync();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (!KEY_MAP[e.code]) return;
    this.keys.delete(e.code);
    this.sync();
  };

  private handleBlur = () => {
    this.keys.clear();
    this.sync();
  };

  private sync() {
    const has = (code: string) => this.keys.has(code);
    const up = has('KeyW') || has('ArrowUp') ? 1 : 0;
    const down = has('KeyS') || has('ArrowDown') ? 1 : 0;
    const left = has('KeyA') || has('ArrowLeft') ? 1 : 0;
    const right = has('KeyD') || has('ArrowRight') ? 1 : 0;
    this.state.forward = up - down;
    this.state.right = right - left;
    this.state.jump = has('Space') || this.mouseJump;
    this.state.brake = has('ShiftLeft') || this.mouseBrake;
    this.state.usePowerup = has('KeyE');
  }

  /** Read and clear the accumulated look delta. */
  takeLook(out: THREE.Vector2) {
    out.set(this.state.yawDelta, this.state.pitchDelta);
    this.state.yawDelta = 0;
    this.state.pitchDelta = 0;
    return out;
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
  }
}
