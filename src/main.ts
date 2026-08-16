import * as THREE from 'three';
import { Level } from './game/level';
import { Input } from './engine/input';
import { Hud, formatTime } from './ui/hud';
import { LEVELS } from './levels';
import type { LevelDef } from './game/types';
import { Audio } from './game/audio';

/**
 * Entry point: renderer, screen flow (menu -> level -> results), and the
 * frame loop. Everything gameplay lives in Level.
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

let level: Level | null = null;
let last = performance.now();

// ------------------------------------------------------------- best times

const BEST_KEY = 'kablam.best';

function loadBests(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveBest(id: string, ms: number) {
  const bests = loadBests();
  if (bests[id] === undefined || ms < bests[id]) {
    bests[id] = ms;
    localStorage.setItem(BEST_KEY, JSON.stringify(bests));
  }
}

// ----------------------------------------------------------------- screens

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const menu = el('div', 'screen');
const results = el('div', 'screen hidden');
uiRoot.append(menu, results);

function buildMenu() {
  menu.replaceChildren();
  const panel = el('div', 'panel');
  panel.append(
    el('h1', 'title', 'Marble Kablam'),
    el('p', 'subtitle', 'Roll through Pittsburgh'),
  );

  const grid = el('div', 'level-grid');
  const bests = loadBests();
  LEVELS.forEach((def, i) => {
    const card = el('button', 'level-card');
    card.append(
      el('div', 'num', `Level ${i + 1} · ${def.difficulty}`),
      el('div', 'name', def.name),
      el('div', 'place', def.place),
    );
    const times = el('div', 'times');
    times.append(el('span', undefined, `Par ${formatTime(def.parTime)}`));
    if (bests[def.id] !== undefined) {
      times.append(el('span', 'best', `Best ${formatTime(bests[def.id])}`));
    }
    card.append(times);
    card.addEventListener('click', () => {
      audio.resume();
      audio.play('menu');
      startLevel(def);
    });
    grid.append(card);
  });
  panel.append(grid);

  const keys = el('div', 'keys');
  const bind = (k: string, what: string) => {
    const kbd = el('div');
    kbd.innerHTML = k
      .split('+')
      .map((s) => `<kbd>${s}</kbd>`)
      .join(' ');
    keys.append(kbd, el('div', undefined, what));
  };
  const row = el('div', 'row');
  row.style.marginTop = '18px';
  bind('W+A+S+D', 'Roll the marble');
  bind('Mouse', 'Look around');
  bind('Space', 'Jump');
  bind('Shift', 'Brake');
  bind('E', 'Use powerup');
  bind('R', 'Restart level');
  row.append(keys);
  panel.append(row);

  menu.append(panel);
}

function showMenu() {
  input.releaseLock();
  hud.show(false);
  level = null;
  buildMenu();
  menu.classList.remove('hidden');
  results.classList.add('hidden');
}

function showResults(def: LevelDef, ms: number) {
  const bests = loadBests();
  const previous = bests[def.id];
  saveBest(def.id, ms);

  results.replaceChildren();
  const panel = el('div', 'panel');
  panel.style.width = 'min(520px, 92vw)';
  panel.append(el('div', 'subtitle', def.name));

  const beatGold = def.goldTime !== undefined && ms <= def.goldTime;
  const beatPar = ms <= def.parTime;
  panel.append(el('h1', 'title', beatGold ? 'Gold Time' : beatPar ? 'Finished' : 'Finished'));
  panel.append(el('div', 'result-time', formatTime(ms)));

  if (beatGold) panel.append(el('span', 'badge gold', 'Gold'));
  else if (beatPar) panel.append(el('span', 'badge par', 'Under par'));

  const line = (label: string, value: string, cls?: string) => {
    const l = el('div', 'result-line');
    l.append(el('span', undefined, label));
    l.append(el('span', `val${cls ? ` ${cls}` : ''}`, value));
    panel.append(l);
  };
  line('Par time', formatTime(def.parTime));
  if (def.goldTime !== undefined) line('Gold time', formatTime(def.goldTime));
  if (previous !== undefined) {
    const delta = ms - previous;
    line(
      'Previous best',
      `${formatTime(previous)}  (${delta < 0 ? '-' : '+'}${formatTime(Math.abs(delta))})`,
      delta < 0 ? 'best' : undefined,
    );
  } else {
    line('Previous best', '—');
  }

  const row = el('div', 'row');
  const again = el('button', 'btn primary', 'Play again');
  again.addEventListener('click', () => startLevel(def));
  const next = el('button', 'btn', 'Next level');
  const idx = LEVELS.indexOf(def);
  next.disabled = idx < 0 || idx + 1 >= LEVELS.length;
  next.addEventListener('click', () => startLevel(LEVELS[idx + 1]));
  const back = el('button', 'btn', 'Level select');
  back.addEventListener('click', showMenu);
  row.append(again, next, back);
  panel.append(row);

  results.append(panel);
  results.classList.remove('hidden');
  input.releaseLock();
  hud.show(false);
}

function startLevel(def: LevelDef) {
  audio.resume();
  menu.classList.add('hidden');
  results.classList.add('hidden');

  level?.dispose();
  level = new Level(def, renderer, canvas.clientWidth / canvas.clientHeight, audio);
  hud.show(true);
  input.requestLock();
  last = performance.now();
}

input.setRestartHandler(() => {
  if (level) level.respawn(true);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && level) showMenu();
});

// -------------------------------------------------------------- frame loop

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  level?.setAspect(w / h);
}
window.addEventListener('resize', resize);
resize();

let reportedFinish = false;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (level) {
    level.handleUseInput(input);
    level.update(dt, input);
    hud.update(level, dt);
    audio.setRolling(
      level.marble.velocity.length(),
      level.marble.onGround,
      level.marble.slipSpeed,
    );
    renderer.render(level.scene, level.camera.camera);

    if (level.phase === 'finished' && !reportedFinish) {
      reportedFinish = true;
      const def = level.def;
      const ms = level.finishTime;
      setTimeout(() => showResults(def, ms), 900);
    }
    if (level.phase !== 'finished') reportedFinish = false;
  }
}

showMenu();
requestAnimationFrame(frame);

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
};

(window as unknown as { kablam: typeof harness }).kablam = harness;
