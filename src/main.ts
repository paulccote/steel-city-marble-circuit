import * as THREE from 'three';
import { Level } from './game/level';
import { Input } from './engine/input';
import { Hud } from './ui/hud';
import { LEVELS } from './levels';
import type { LevelDef } from './game/types';
import { Audio } from './game/audio';
import { Shell } from './ui/menu';
import { Settings } from './ui/settings';
import { nextFrame } from './ui/dom';

/**
 * Entry point: renderer, screen flow, pointer lock, and the frame loop.
 * Everything gameplay lives in Level; everything menu lives in ui/menu.
 */

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const audio = new Audio();
const input = new Input(canvas);
const hud = new Hud();
uiRoot.append(hud.root);

/**
 * A stand-in for the player's input, used to tick scenes nobody is driving:
 * the menu backdrop and the frozen post-finish scene. Constructing a second
 * real Input would double-bind every global key listener.
 */
const idleInput = {
  state: {
    forward: 0,
    right: 0,
    jump: false,
    brake: false,
    usePowerup: false,
    yawDelta: 0,
    pitchDelta: 0,
  },
  takeLook: (out: THREE.Vector2) => out.set(0, 0),
} as unknown as Input;

type Screen = 'menu' | 'levels' | 'playing' | 'paused' | 'results';

let screen: Screen = 'menu';
let level: Level | null = null;
let backdrop: Level | null = null;
let backdropId = '';
let last = performance.now();

// ------------------------------------------------------------- best times

const BEST_KEY = 'kablam.best';

function loadBests(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveBest(id: string, ms: number) {
  const bests = loadBests();
  if (bests[id] === undefined || ms < bests[id]) {
    bests[id] = ms;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(bests));
    } catch {
      // Private browsing: the run still counts, it just will not persist.
    }
  }
}

// ---------------------------------------------------------------- settings

const settings = new Settings(renderer, input, audio, () =>
  [level?.scene, backdrop?.scene].filter((s): s is THREE.Scene => !!s),
);

// ------------------------------------------------------------------- shell

const shell = new Shell({
  levels: LEVELS,
  settings,
  getBests: loadBests,
  onPlay: (def) => {
    // Pointer lock must be requested inside the click that asked to play;
    // by the time the level has finished building the gesture may be gone.
    audio.resume();
    requestLock();
    void enterLevel(def);
  },
  onPreview: (def) => requestBackdrop(def),
  onResume: () => resume(),
  onRestart: () => {
    if (!level) return;
    const def = level.def;
    requestLock();
    void enterLevel(def);
  },
  onExitToMenu: (view) => exitToMenu(view),
  // The shell can navigate on its own (Courses from the main menu); keep the
  // frame loop's idea of where we are in step with it.
  onView: (view) => {
    screen = view === 'none' ? 'playing' : view === 'pause' ? 'paused' : view;
  },
  onBlip: () => {
    audio.resume();
    audio.play('menu');
  },
});
uiRoot.append(shell.root);

settings.onApply = () => hud.setShowFps(settings.data.showFps);

// ----------------------------------------------------------- pointer lock

/**
 * The lock contract: clicking the canvas locks, Escape unlocks and pauses.
 * Escape is swallowed by the browser when it is what released the lock, so the
 * pause has to hang off pointerlockchange rather than off the key event — and
 * only once we have actually held the lock, otherwise a headless run that
 * never locks would pause itself.
 */
let hadLock = false;
let lockRetry = 0;

function requestLock() {
  if (document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock() as unknown;
    const promise = result as Promise<void> | undefined;
    if (promise && typeof promise.catch === 'function') promise.catch(() => undefined);
  } catch {
    // Chrome refuses for ~1s after a user-initiated Escape; armLock retries.
  }
}

function armLock() {
  requestLock();
  clearTimeout(lockRetry);
  lockRetry = window.setTimeout(() => {
    if (screen === 'playing' && document.pointerLockElement !== canvas) requestLock();
  }, 1400);
}

function releaseLock() {
  clearTimeout(lockRetry);
  hadLock = false;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    hadLock = true;
  } else if (screen === 'playing' && hadLock) {
    hadLock = false;
    openPause();
  }
});

// ----------------------------------------------------------- screen flow

function goto(next: Screen) {
  screen = next;
  shell.setView(next === 'playing' ? 'none' : next === 'paused' ? 'pause' : next);
}

function exitToMenu(view: 'menu' | 'levels') {
  releaseLock();
  hud.show(false);
  level?.dispose();
  level = null;
  goto(view);
  void ensureBackdrop(shell.selected);
}

/** Show the loading card, let it paint, then build. */
async function enterLevel(def: LevelDef) {
  shell.setLoading(true, def.name);
  await nextFrame();
  await nextFrame();
  startLevel(def);
  await nextFrame();
  shell.setLoading(false);
}

/** Synchronous level start. The test harness depends on this returning with
 *  `level` already constructed, so it must not await anything. */
function startLevel(def: LevelDef) {
  audio.resume();
  level?.dispose();
  level = new Level(def, renderer, aspect(), audio);
  hud.reset();
  hud.show(true);
  reportedFinish = false;
  // The play button may already have taken the lock while the level built.
  hadLock = document.pointerLockElement === canvas;
  goto('playing');
  last = performance.now();
  armLock();
}

function openPause() {
  if (screen !== 'playing' || !level) return;
  shell.setPauseStats(level.def, level.clock, level.gemsCollected, level.gemsTotal);
  hud.show(false);
  goto('paused');
  releaseLock();
}

function resume() {
  if (screen !== 'paused') return;
  shell.closeOverlay();
  hud.show(true);
  goto('playing');
  last = performance.now();
  armLock();
}

function finishRun(def: LevelDef, ms: number, gems: number, gemsTotal: number) {
  const previousBest = loadBests()[def.id];
  saveBest(def.id, ms);
  hud.show(false);
  screen = 'results';
  releaseLock();
  shell.showResults({ def, ms, gems, gemsTotal, previousBest });
}

/** Backwards-compatible menu entry point, still used by the test harness. */
function showMenu() {
  exitToMenu('menu');
}

// -------------------------------------------------------- menu backdrop

/**
 * The main menu is the level itself, seen from a slow orbit. Building it costs
 * the same as starting a level, so selection changes are debounced — holding
 * the next-course arrow should not queue up five level builds.
 */
const orbitCam = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const orbitFrom = new THREE.Vector3();
const orbitTo = new THREE.Vector3();
const orbitTarget = new THREE.Vector3();
let orbitT = 0;
let backdropPending = 0;
let backdropBusy = false;

function requestBackdrop(def: LevelDef) {
  clearTimeout(backdropPending);
  backdropPending = window.setTimeout(() => void ensureBackdrop(def), 350);
}

async function ensureBackdrop(def: LevelDef) {
  if (!def || backdropId === def.id || backdropBusy) return;
  if (screen === 'playing' || screen === 'paused' || screen === 'results') return;
  backdropBusy = true;
  shell.setLoading(true, def.name);
  await nextFrame();
  await nextFrame();
  backdrop?.dispose();
  backdrop = new Level(def, renderer, aspect(), null);
  backdropId = def.id;
  resetOrbit(def);
  await nextFrame();
  shell.setLoading(false);
  backdropBusy = false;
}

function resetOrbit(def: LevelDef) {
  orbitT = 0;
  orbitFrom.fromArray(def.spawn.pos);
  const end = def.entities.find((e) => e.kind === 'endPad');
  orbitTo.fromArray(end ? end.pos : def.spawn.pos);
  updateOrbit(0);
}

function updateOrbit(dt: number) {
  orbitT += dt;
  // Drift only a third of the way toward the finish: far enough to tour the
  // opening of the course, close enough that the sun's shadow frustum (which
  // stays centred on the parked marble) still covers what we are looking at.
  const k = (0.5 - 0.5 * Math.cos(orbitT * 0.055)) * 0.35;
  orbitTarget.lerpVectors(orbitFrom, orbitTo, k);
  orbitTarget.y += 1.5;

  const a = orbitT * 0.075 + 2.1;
  const r = 26 + Math.sin(orbitT * 0.11) * 4;
  const h = 13 + Math.sin(orbitT * 0.17) * 2.5;
  orbitCam.position.set(
    orbitTarget.x + Math.cos(a) * r,
    orbitTarget.y + h,
    orbitTarget.z + Math.sin(a) * r,
  );
  orbitCam.lookAt(orbitTarget);
}

// --------------------------------------------------------------- keyboard

input.setRestartHandler(() => {
  if (screen === 'playing' && level) {
    level.respawn(true);
    hud.reset();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (shell.overlay !== 'none') {
      shell.closeOverlay();
      return;
    }
    if (screen === 'playing') openPause();
    else if (screen === 'paused') resume();
    else if (screen === 'levels') goto('menu');
    else if (screen === 'results') exitToMenu('levels');
    return;
  }

  if (screen === 'levels') {
    if (e.code === 'ArrowLeft') shell.step(-1);
    else if (e.code === 'ArrowRight') shell.step(1);
    else if (e.code === 'Enter') shellPlay();
  } else if (screen === 'menu' && e.code === 'Enter') {
    shellPlay();
  }
});

function shellPlay() {
  audio.resume();
  requestLock();
  void enterLevel(shell.selected);
}

// -------------------------------------------------------------- frame loop

function aspect() {
  return Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  level?.setAspect(w / h);
  backdrop?.setAspect(w / h);
  orbitCam.aspect = w / h;
  orbitCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let reportedFinish = false;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (screen === 'playing' && level) {
    level.handleUseInput(input);
    level.update(dt, input);
    hud.update(level, dt);
    audio.setRolling(
      level.marble.velocity.length(),
      level.marble.onGround,
      level.marble.slipSpeed,
      level.marble.lastContactMaterial.kind,
    );
    renderer.render(level.scene, level.camera.camera);

    if (level.phase === 'finished' && !reportedFinish) {
      reportedFinish = true;
      const def = level.def;
      const ms = level.finishTime;
      const gems = level.gemsCollected;
      const total = level.gemsTotal;
      // A beat of celebration before the panel covers the finish pad.
      setTimeout(() => finishRun(def, ms, gems, total), 900);
    }
    if (level.phase !== 'finished') reportedFinish = false;
  } else if (level && (screen === 'paused' || screen === 'results')) {
    audio.setRolling(0, false, 0);
    // Paused means frozen; results keeps ticking so the finish sparkle plays.
    if (screen === 'results') level.update(dt, idleInput);
    renderer.render(level.scene, level.camera.camera);
  } else if (backdrop) {
    backdrop.update(dt, idleInput);
    updateOrbit(dt);
    audio.setRolling(0, false, 0);
    renderer.render(backdrop.scene, orbitCam);
  }
}

async function boot() {
  // Applied here rather than at construction: it sets the pixel ratio, which
  // only means anything once the renderer has been sized.
  settings.apply();
  resize();
  goto('menu');
  requestAnimationFrame(frame);
  await ensureBackdrop(shell.selected);
  shell.setLoading(false);
}

void boot();

/**
 * Test harness. Automated comparison runs against the reference need to drive
 * the marble without a real keyboard, and need the clock to advance in
 * deterministic steps rather than at whatever rate the headless browser
 * happens to paint.
 */
const harness = {
  get level() {
    return level;
  },
  get input() {
    return input;
  },
  startLevel,
  showMenu,
  LEVELS,

  /** Hold a set of controls for `ms` of simulated time. */
  async drive(ms: number, controls: Partial<{ forward: number; right: number; jump: boolean; brake: boolean }> = {}) {
    if (!level) return null;
    Object.assign(input.state, {
      forward: controls.forward ?? 0,
      right: controls.right ?? 0,
      jump: controls.jump ?? false,
      brake: controls.brake ?? false,
    });
    const end = performance.now() + ms;
    while (performance.now() < end) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    Object.assign(input.state, { forward: 0, right: 0, jump: false, brake: false });
    return harness.probe();
  },

  /** Skip the start-of-level countdown. */
  skipCountdown() {
    if (level) level.elapsed = 3600;
  },

  probe() {
    if (!level) return null;
    const m = level.marble;
    return {
      phase: level.phase,
      clock: level.clock,
      pos: m.position.toArray(),
      vel: m.velocity.toArray(),
      speed: m.velocity.length(),
      onGround: m.onGround,
      omega: m.omega.length(),
      gems: `${level.gemsCollected}/${level.gemsTotal}`,
      held: level.heldPowerup,
    };
  },

  teleport(x: number, y: number, z: number) {
    level?.marble.reset(new THREE.Vector3(x, y, z));
  },

  setYaw(yaw: number) {
    if (level) level.camera.yaw = yaw;
  },

  /** Screen control, so a run can screenshot any menu without clicking. */
  ui: {
    get screen() {
      return screen;
    },
    menu: () => exitToMenu('menu'),
    levels: () => exitToMenu('levels'),
    pause: () => openPause(),
    resume: () => resume(),
    results: (ms?: number) => {
      const def = level?.def ?? shell.selected;
      finishRun(def, ms ?? level?.clock ?? def.parTime - 1, level?.gemsCollected ?? 0, level?.gemsTotal ?? 0);
    },
    settings: () => shell.openOverlay('settings'),
    controls: () => shell.openOverlay('controls'),
    closeOverlay: () => shell.closeOverlay(),
    select: (i: number) => shell.select(i),
  },
};

(window as unknown as { kablam: typeof harness }).kablam = harness;
