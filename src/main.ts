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

// ?q=low|medium|high forces a graphics tier before anything is drawn, so a
// machine that struggles at the stored setting can still be opened straight
// into a playable one without navigating menus first.
{
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'medium' || q === 'high') settings.set('quality', q);
}

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
  // Exact, rather than inferring a use from the held slot going empty.
  level.onPowerupUsed = () => hud.flashPowerupUse();
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
/**
 * Candidate orbit geometry, each list ordered best-looking first. The default
 * (23 back, 17 up, a wide sway) is the framing that was tuned by eye; the rest
 * exist so a level whose scenery crowds the course can be backed away from or
 * risen above rather than flown through.
 */
const ORBIT_REACH = [23, 28, 34];
const ORBIT_LIFT = [17, 21, 26, 32];
const ORBIT_SWAY = [0.8, 0.55, 0.3];
/** Headings tried around the course, starting from broadside. */
const ORBIT_HEADINGS = 12;
/** Below this the camera is close enough to clip scenery, so keep searching. */
const ORBIT_MIN_CLEARANCE = 2.5;

const orbitCam = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const orbitFrom = new THREE.Vector3();
const orbitTo = new THREE.Vector3();
const orbitTarget = new THREE.Vector3();
let orbitT = 0;
// Solved per level by fitOrbit: heading of the sway, how wide it swings, and
// how far back and how high the camera sits.
let orbitBase = 0;
let orbitSway = ORBIT_SWAY[0];
let orbitReach = ORBIT_REACH[0];
let orbitLift = ORBIT_LIFT[0];
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

  // Stand broadside to the run from start to finish, so the course crosses the
  // frame instead of receding to a point. Sitting behind the spawn instead
  // sounds right and is not: level authors put the scenery that backs a start
  // pad *behind* the camera there, so you end up staring at the back of a
  // facade.
  const dx = orbitTo.x - orbitFrom.x;
  const dz = orbitTo.z - orbitFrom.z;
  const yaw = def.spawn.yaw;
  const broadside =
    Math.hypot(dx, dz) > 4
      ? Math.atan2(-dx, dz)
      : Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
  fitOrbit(def, broadside);
  updateOrbit(0);
}

/**
 * Choose the orbit geometry that keeps the camera out of the scenery.
 *
 * Broadside leaves two sides, and they are not equivalent: a level whose
 * skyline is a ring of towers *around* the course has one side that parks the
 * camera inside a glass facade and one that has the towers standing behind the
 * course where they belong. Two of six levels need more than a side flip —
 * Point is crowded on both sides — so the search also backs the camera off and
 * raises it, in that order of preference, and settles for the roomiest option
 * if nothing clears outright.
 *
 * The samples below have to span the *whole* envelope the orbit actually flies.
 * An earlier version sampled a narrower one and confidently picked the worse
 * side on Clemente, which is the entire failure mode this guards against.
 */
function fitOrbit(def: LevelDef, broadside: number) {
  let best = { base: broadside, sway: ORBIT_SWAY[0], reach: ORBIT_REACH[0], lift: ORBIT_LIFT[0] };
  let bestClearance = -Infinity;

  for (const lift of ORBIT_LIFT) {
    for (const reach of ORBIT_REACH) {
      for (const sway of ORBIT_SWAY) {
        let pick = -Infinity;
        let picked = NaN;

        for (let i = 0; i < ORBIT_HEADINGS; i++) {
          const base = broadside + (i * 2 * Math.PI) / ORBIT_HEADINGS;
          const clear = scoreOrbit(def, base, sway, reach, lift);
          if (clear > bestClearance) {
            bestClearance = clear;
            best = { base, sway, reach, lift };
          }
          if (clear < ORBIT_MIN_CLEARANCE) continue;

          // Among headings that are safe, take the one with the most city
          // standing behind the course, discounted by how far it strays from
          // broadside. Clearance alone cannot tell a plaza with downtown behind
          // it from a plaza in front of empty sky — both are perfectly clear.
          const offAxis = Math.abs(Math.asin(Math.abs(Math.sin(base - broadside))));
          const score = backdropScore(def, base, reach, lift) * (1 - offAxis / Math.PI);
          if (score > pick) {
            pick = score;
            picked = base;
          }
        }

        // First workable size of orbit wins: the lists are ordered so that is
        // also the best-looking one.
        if (!Number.isNaN(picked)) {
          orbitBase = picked;
          orbitSway = sway;
          orbitReach = reach;
          orbitLift = lift;
          return;
        }
      }
    }
  }

  orbitBase = best.base;
  orbitSway = best.sway;
  orbitReach = best.reach;
  orbitLift = best.lift;
}

/** Worst clearance a candidate orbit ever gets to, across its whole path. */
function scoreOrbit(
  def: LevelDef,
  base: number,
  sway: number,
  reach: number,
  lift: number,
): number {
  let worst = Infinity;
  for (let ti = 0; ti <= 5; ti++) {
    orbitTarget.lerpVectors(orbitFrom, orbitTo, 0.08 + (ti / 5) * 0.3);
    // The radius and height each breathe by a few units as the orbit runs, so
    // test the corners of that box rather than its centre.
    for (const r of [reach - 3, reach + 3]) {
      for (const h of [lift - 2, lift + 2]) {
        for (let ai = 0; ai <= 10; ai++) {
          const a = base + (ai / 10 - 0.5) * 2 * sway;
          const d = clearanceAt(
            def,
            orbitTarget.x + Math.cos(a) * r,
            orbitTarget.y + 1.5 + h,
            orbitTarget.z + Math.sin(a) * r,
          );
          if (d < worst) worst = d;
        }
      }
    }
  }
  return worst;
}

/**
 * How much scenery stands *behind* the course from a given side — roughly the
 * apparent area of every block past the subject and inside the view cone.
 *
 * This is what separates "the course sits in a city" from "the course floats in
 * front of the sky". Clearance alone cannot tell the two apart: empty air scores
 * perfectly on clearance.
 */
function backdropScore(def: LevelDef, base: number, reach: number, lift: number): number {
  orbitTarget.lerpVectors(orbitFrom, orbitTo, 0.23);
  const cx = orbitTarget.x + Math.cos(base) * reach;
  const cy = orbitTarget.y + 1.5 + lift;
  const cz = orbitTarget.z + Math.sin(base) * reach;
  const fx = orbitTarget.x - cx;
  const fz = orbitTarget.z - cz;
  const flen = Math.hypot(fx, fz) || 1;

  let score = 0;
  for (const b of def.blocks) {
    const dx = b.pos[0] - cx;
    const dz = b.pos[2] - cz;
    const dist = Math.hypot(dx, dz);
    // Beyond the subject, in front of the camera, and near enough to read
    // through the fog.
    if (dist < flen || dist > 320) continue;
    if ((dx * fx + dz * fz) / (dist * flen) < 0.77) continue;

    let w: number;
    let h: number;
    if (b.kind === 'box' || b.kind === 'ramp') {
      w = Math.max(b.size[0], b.size[2]);
      h = b.size[1];
    } else if (b.kind === 'cylinder') {
      w = b.radius * 2;
      h = b.height;
    } else {
      w = (b.radius + b.width / 2) * 2;
      h = b.thickness * 2;
    }
    // Only scenery standing at or above the camera reads as a backdrop;
    // anything far below is floor, and floor is what we are trying to fill.
    if (b.pos[1] + h / 2 < cy - 6) continue;
    score += (w * h) / dist;
  }
  return score;
}

/** Distance from a point to the nearest block, negative when inside one. */
function clearanceAt(def: LevelDef, x: number, y: number, z: number): number {
  let min = Infinity;
  for (const b of def.blocks) {
    let hx: number;
    let hy: number;
    let hz: number;
    if (b.kind === 'box' || b.kind === 'ramp') {
      hx = b.size[0] / 2;
      hy = b.size[1] / 2;
      hz = b.size[2] / 2;
    } else if (b.kind === 'cylinder') {
      hx = hz = b.radius;
      hy = b.height / 2;
    } else {
      hx = hz = b.radius + b.width / 2;
      hy = b.thickness;
    }
    // An axis-aligned test is enough: the question is only whether the camera
    // would be buried, not what the exact surface distance is.
    const d = Math.max(
      Math.abs(x - b.pos[0]) - hx,
      Math.abs(y - b.pos[1]) - hy,
      Math.abs(z - b.pos[2]) - hz,
    );
    if (d < min) min = d;
  }
  return min;
}

function updateOrbit(dt: number) {
  orbitT += dt;
  // Drift only a third of the way toward the finish: far enough to tour the
  // opening of the course, close enough that the sun's shadow frustum (which
  // stays centred on the parked marble) still covers what we are looking at.
  // Never aim at the spawn exactly: the scenery an author puts right behind a
  // start pad is close enough to fill the frame as a flat slab. Starting a
  // little way down the course puts that mass off to one side.
  const k = 0.08 + (0.5 - 0.5 * Math.cos(orbitT * 0.055)) * 0.3;
  orbitTarget.lerpVectors(orbitFrom, orbitTo, k);
  orbitTarget.y += 1.5;

  // A shallow boom put the horizon through the middle of the frame, which read
  // as the course hanging in mid-air with a skyline pasted behind it. Around
  // 36 degrees of elevation pushes the horizon off the top edge, so the ground
  // and the rivers fill the frame and the course sits *in* the city. The angle
  // sways either side of the spawn heading rather than orbiting all the way
  // round, which keeps the course in front of the camera at all times.
  const a = orbitBase + Math.sin(orbitT * 0.085) * orbitSway;
  const r = orbitReach + Math.sin(orbitT * 0.11) * 3;
  const h = orbitLift + Math.sin(orbitT * 0.17) * 2;
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

  // Comparison runs need to screenshot a specific menu on a specific course
  // without synthesising clicks first: `#levels` opens course select, and
  // `#course=3` (1-based, and combinable as `#course=3,levels`) picks one.
  const hash = location.hash.slice(1).split(',');
  const course = hash.find((h) => h.startsWith('course='));
  if (course) shell.select(Number(course.slice(7)) - 1);

  goto('menu');
  requestAnimationFrame(frame);
  await ensureBackdrop(shell.selected);
  shell.setLoading(false);

  if (hash.includes('levels')) goto('levels');

}

void boot();

/**
 * Test harness. Automated comparison runs against the reference need to drive
 * the marble without a real keyboard, and need the clock to advance in
 * deterministic steps rather than at whatever rate the headless browser
 * happens to paint.
 */
/**
 * Reports what this machine is actually doing, because a frame-rate counter
 * cannot tell the difference between a slow GPU, a huge backing store and a
 * browser that simply chose to paint less often.
 */
async function diag(seconds = 4) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const intervals: number[] = [];
  const work: number[] = [];
  const orig = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb: FrameRequestCallback) {
    return orig.call(window, (t) => {
      const a = performance.now();
      cb(t);
      work.push(performance.now() - a);
    });
  };
  let prev = performance.now();
  const end = prev + seconds * 1000;
  while (performance.now() < end) {
    await new Promise((r) => orig.call(window, () => r(null)));
    const n = performance.now();
    intervals.push(n - prev);
    prev = n;
  }
  window.requestAnimationFrame = orig;

  const stat = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return {
      median: +(s[Math.floor(s.length / 2)] ?? 0).toFixed(2),
      p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(2),
      worst: +(s[s.length - 1] ?? 0).toFixed(2),
    };
  };

  return {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    quality: settings.data.quality,
    devicePixelRatio,
    cssSize: `${canvas.clientWidth}x${canvas.clientHeight}`,
    backingStore: `${canvas.width}x${canvas.height}`,
    megapixels: +((canvas.width * canvas.height) / 1e6).toFixed(2),
    shadows: renderer.shadowMap.enabled,
    // Interval is what you feel; work is what our JavaScript costs. If interval
    // is high while work is low, the time is going to the GPU, not to us.
    frameIntervalMs: stat(intervals),
    ourWorkMs: stat(work.filter((w) => w > 0.2)),
    level: level ? level.def.id : null,
  };
}

const harness = {
  diag,
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
