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
    this.data = { ...DEFAULTS, ...load() };
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    this.data[key] = value;
    save(this.data);
    this.apply();
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
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
