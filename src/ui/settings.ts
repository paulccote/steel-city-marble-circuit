import * as THREE from 'three';
import type { Input } from '../engine/input';
import type { Audio } from '../game/audio';

/**
 * Player settings. These are stored as normalised 0..1 slider positions rather
 * than as engine values so the mapping curve can change later without
 * invalidating everyone's saved preferences.
 */

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  /** Slider position, mapped onto Input.sensitivity. */
  sensitivity: number;
  invertY: boolean;
  volume: number;
  muted: boolean;
  quality: Quality;
  showFps: boolean;
}

const KEY = 'kablam.settings';

/**
 * A first guess at what this machine can afford, used only until the frame
 * timer has an opinion. Defaulting everyone to `high` meant a Retina laptop
 * opened the game at four times the fragment cost of a 1x display and had no
 * idea why it was crawling.
 */
function guessQuality(): Quality {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const px = window.innerWidth * dpr * window.innerHeight * dpr;
  if (px > 5_000_000) return 'medium';
  return 'high';
}

const DEFAULTS: SettingsData = {
  sensitivity: 0.35,
  invertY: false,
  volume: 0.55,
  muted: false,
  quality: 'high',
  showFps: true,
};

/** Marble Blast maps its sensitivity slider onto lerp(1/2500, 1/100, s). */
export function sensitivityFor(slider: number): number {
  return 1 / 2500 + slider * (1 / 100 - 1 / 2500);
}

const QUALITY: Record<Quality, { shadows: boolean; pixelRatio: number; soft: boolean }> = {
  low: { shadows: false, pixelRatio: 1, soft: false },
  medium: { shadows: true, pixelRatio: 1.35, soft: false },
  high: { shadows: true, pixelRatio: 2, soft: true },
};

export class Settings {
  data: SettingsData;

  /** Fired after every apply, for settings the engine does not own (HUD chrome). */
  onApply: (() => void) | null = null;

  private renderer: THREE.WebGLRenderer;
  private input: Input;
  private audio: Audio;
  /** Scenes whose materials must be recompiled when the shadow flag flips. */
  private scenes: () => THREE.Scene[];

  /**
   * Extra resolution cut applied on top of the chosen quality tier, driven by
   * measured frame time. A tier is a statement about how the game should look;
   * this is what keeps it playable when the machine cannot afford that look.
   * Fragment cost scales with the square of this, so small steps go a long way.
   */
  private adaptiveScale = 1;
  private frameAcc = 0;
  private frameCount = 0;
  private sinceChange = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    input: Input,
    audio: Audio,
    scenes: () => THREE.Scene[],
  ) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.scenes = scenes;
    // A stored choice is the player's; only guess for a first-time visitor.
    const stored = load();
    this.data = { ...DEFAULTS, quality: guessQuality(), ...stored };
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    this.data[key] = value;
    // A deliberate quality change deserves a clean slate: honour what was asked
    // for, then let the measurements pull it back down again if they must.
    if (key === 'quality') this.adaptiveScale = 1;
    save(this.data);
    this.apply();
  }

  /**
   * Called once per rendered frame with the frame interval. Steps the render
   * resolution down while frames are missing 60fps and back up once there is
   * headroom, with a wide dead band so it settles instead of oscillating.
   */
  observeFrame(dt: number) {
    this.frameAcc += dt;
    this.frameCount++;
    this.sinceChange += dt;
    if (this.frameCount < 45) return;

    const avgMs = (this.frameAcc / this.frameCount) * 1000;
    this.frameAcc = 0;
    this.frameCount = 0;
    // Give a change time to take effect before judging it.
    if (this.sinceChange < 1) return;

    const before = this.adaptiveScale;
    if (avgMs > 20) this.adaptiveScale = Math.max(0.5, this.adaptiveScale - 0.15);
    else if (avgMs < 13.5 && this.adaptiveScale < 1) this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.1);

    if (this.adaptiveScale !== before) {
      this.sinceChange = 0;
      this.applyPixelRatio();
    }
  }

  private applyPixelRatio() {
    const q = QUALITY[this.data.quality];
    const target = Math.min(devicePixelRatio, q.pixelRatio) * this.adaptiveScale;
    // Below 0.6 the image turns to mush and the frames bought are not worth it.
    this.renderer.setPixelRatio(Math.max(0.6, target));
  }

  /** For the settings UI, so the player can see what the game settled on. */
  get effectiveScale() {
    return this.adaptiveScale;
  }

  /** Push every setting into the engine. Safe to call at any time. */
  apply() {
    const d = this.data;
    this.input.sensitivity = sensitivityFor(d.sensitivity);
    this.input.invertY = d.invertY;
    this.audio.setVolume(d.volume);
    this.audio.setMuted(d.muted);

    const q = QUALITY[d.quality];
    const wasShadows = this.renderer.shadowMap.enabled;
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    // Three bakes the shadow path into each program, so toggling shadows on a
    // scene that is already built needs every material recompiled once.
    if (wasShadows !== q.shadows) {
      for (const scene of this.scenes()) {
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material;
          if (!mat) return;
          if (Array.isArray(mat)) for (const m of mat) m.needsUpdate = true;
          else mat.needsUpdate = true;
        });
      }
    }

    this.onApply?.();
  }
}

function load(): Partial<SettingsData> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<SettingsData>) : {};
  } catch {
    return {};
  }
}

function save(data: SettingsData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private-mode browsers throw here; losing settings is not worth a crash.
  }
}
