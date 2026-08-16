import type { Difficulty, LevelDef } from '../game/types';
import { formatTime } from './hud';
import { el, button, iconButton } from './dom';
import { ICON, riversMark, wordmark } from './icons';
import { drawLevelMap } from './preview';
import type { Quality, Settings } from './settings';

/**
 * Every menu in the game. The screens live over a live 3D backdrop rather than
 * over a flat panel, so nothing here paints a full-bleed opaque background —
 * scrims are directional and the plates are small enough that the level behind
 * them is always readable. That is the whole difference between a menu that
 * feels like a game and one that feels like a settings dialog.
 */

export type View = 'none' | 'menu' | 'levels' | 'pause' | 'results';
export type Overlay = 'none' | 'settings' | 'controls';

export interface ResultsData {
  def: LevelDef;
  ms: number;
  gems: number;
  gemsTotal: number;
  /** Best time before this run, if any. */
  previousBest?: number;
}

export interface ShellDeps {
  levels: LevelDef[];
  settings: Settings;
  getBests: () => Record<string, number>;
  onPlay: (def: LevelDef) => void;
  /** The selection changed; the backdrop should show this level. */
  onPreview: (def: LevelDef) => void;
  onResume: () => void;
  onRestart: () => void;
  /** Leave the running level and land on the given menu view. */
  onExitToMenu: (view: 'menu' | 'levels') => void;
  /** The shell navigated itself; the host's screen state has to follow. */
  onView: (view: View) => void;
  onBlip: () => void;
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

const SELECTED_KEY = 'kablam.selected';

const CONTROLS: [string, string][] = [
  ['W A S D', 'Roll the marble'],
  ['Mouse', 'Look around'],
  ['Space | LMB', 'Jump'],
  ['Shift | RMB', 'Brake'],
  ['E', 'Use held powerup'],
  ['R', 'Restart the course'],
  ['Esc', 'Pause'],
];

export class Shell {
  readonly root = el('div', 'shell');

  private deps: ShellDeps;
  private view: View = 'none';
  private overlayView: Overlay = 'none';

  private screens: Record<Exclude<View, 'none'>, HTMLElement>;
  private overlays: Record<Exclude<Overlay, 'none'>, HTMLElement>;
  private loader = el('div', 'loading');
  private loaderLabel = el('div', 'loading-label');

  private selectedIndex = 0;

  // Level-select nodes kept around so selection changes patch in place.
  private lv = {
    num: el('div', 'lv-num'),
    name: el('h2', 'lv-name'),
    place: el('div', 'lv-place'),
    hint: el('p', 'lv-hint'),
    par: el('div', 'stat-value'),
    gold: el('div', 'stat-value'),
    best: el('div', 'stat-value'),
    bestCard: el('div', 'stat-card best'),
    goldCard: el('div', 'stat-card'),
    canvas: el('canvas', 'preview-canvas'),
    chips: el('div', 'chip-strip'),
    counter: el('div', 'plate-count'),
    medal: el('div', 'lv-medal'),
  };

  private menuFoot = el('div', 'menu-foot');
  private results = el('div', 'plate results-plate');

  constructor(deps: ShellDeps) {
    this.deps = deps;
    this.selectedIndex = this.loadSelection();

    this.screens = {
      menu: this.buildMenu(),
      levels: this.buildLevels(),
      pause: this.buildPause(),
      results: this.buildResults(),
    };
    this.overlays = {
      settings: this.buildSettings(),
      controls: this.buildControls(),
    };

    // The loader starts visible: the first level build happens before anything
    // has been rendered, and a black canvas for half a second reads as a crash.
    this.loaderLabel.textContent = 'Marble Kablam';
    this.loader.append(el('div', 'loading-marble'), this.loaderLabel);

    this.root.append(
      ...Object.values(this.screens),
      ...Object.values(this.overlays),
      this.loader,
    );
    for (const s of Object.values(this.screens)) s.classList.add('hidden');
    for (const o of Object.values(this.overlays)) o.classList.add('hidden');
  }

  // ------------------------------------------------------------------ state

  get current(): View {
    return this.view;
  }

  get overlay(): Overlay {
    return this.overlayView;
  }

  get selected(): LevelDef {
    return this.deps.levels[this.selectedIndex] ?? this.deps.levels[0];
  }

  setView(view: View) {
    this.view = view;
    for (const [name, node] of Object.entries(this.screens)) {
      node.classList.toggle('hidden', name !== view);
    }
    if (view === 'menu' || view === 'levels') this.refreshSelection(false);
    if (view === 'menu') this.refreshMenuFoot();
    if (view !== 'menu' && view !== 'pause') this.closeOverlay();
    this.deps.onView(view);
  }

  openOverlay(which: Exclude<Overlay, 'none'>) {
    this.overlayView = which;
    for (const [name, node] of Object.entries(this.overlays)) {
      node.classList.toggle('hidden', name !== which);
    }
  }

  closeOverlay() {
    this.overlayView = 'none';
    for (const node of Object.values(this.overlays)) node.classList.add('hidden');
  }

  setLoading(on: boolean, label = 'Loading') {
    this.loaderLabel.textContent = label;
    this.loader.classList.toggle('hidden', !on);
  }

  /** Arrow keys drive level select without touching the mouse. */
  step(delta: number) {
    const n = this.deps.levels.length;
    if (n === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + n) % n;
    this.saveSelection();
    this.refreshSelection(true);
    this.deps.onBlip();
  }

  select(index: number) {
    this.selectedIndex = Math.max(0, Math.min(this.deps.levels.length - 1, index));
    this.saveSelection();
    this.refreshSelection(true);
  }

  // ------------------------------------------------------------- main menu

  private buildMenu(): HTMLElement {
    const screen = el('div', 'screen screen-menu');
    const left = el('div', 'menu-left');

    const brand = el('div', 'brand');
    brand.append(riversMark());
    const chip = el('div', 'brand-chip', 'Pittsburgh, PA');
    const title = el('div', 'brand-title');
    title.append(el('span', 'brand-marble', 'Marble'), wordmark());
    brand.append(chip, title, el('div', 'brand-rule'), el('div', 'brand-sub', 'Steel City Marble Circuit'));

    const buttons = el('div', 'menu-buttons');
    buttons.append(
      iconButton('mb-btn big primary', 'Play', ICON.play(), () => {
        this.deps.onBlip();
        this.deps.onPlay(this.selected);
      }),
      iconButton('mb-btn big', 'Courses', ICON.list(), () => {
        this.deps.onBlip();
        this.setView('levels');
      }),
      iconButton('mb-btn big', 'Settings', ICON.gear(), () => {
        this.deps.onBlip();
        this.openOverlay('settings');
      }),
      iconButton('mb-btn big', 'Controls', ICON.keyboard(), () => {
        this.deps.onBlip();
        this.openOverlay('controls');
      }),
    );

    left.append(brand, buttons, this.menuFoot);
    screen.append(left, el('div', 'menu-version', 'v1.0 · built for the incline'));
    return screen;
  }

  private refreshMenuFoot() {
    const def = this.selected;
    if (!def) return;
    const best = this.deps.getBests()[def.id];
    this.menuFoot.replaceChildren();
    const label = el('div', 'foot-label', 'Next up');
    const name = el('div', 'foot-name', def.name);
    const meta = el('div', 'foot-meta');
    meta.append(el('span', undefined, DIFFICULTY_LABEL[def.difficulty]));
    meta.append(el('span', 'dot', '·'));
    meta.append(el('span', undefined, `Par ${formatTime(def.parTime)}`));
    if (best !== undefined) {
      meta.append(el('span', 'dot', '·'));
      meta.append(el('span', 'gold-text', `Best ${formatTime(best)}`));
    }
    this.menuFoot.append(label, name, meta);
  }

  // ----------------------------------------------------------- level select

  private buildLevels(): HTMLElement {
    const screen = el('div', 'screen screen-levels');
    const plate = el('div', 'plate levels-plate');

    const head = el('div', 'plate-head');
    head.append(
      iconButton('mb-btn ghost sm', 'Menu', ICON.back(), () => {
        this.deps.onBlip();
        this.setView('menu');
      }),
      el('div', 'plate-title', 'Select a Course'),
      this.lv.counter,
    );

    const body = el('div', 'levels-body');

    const detail = el('div', 'levels-detail');
    const nameRow = el('div', 'lv-name-row');
    nameRow.append(this.lv.name, this.lv.medal);
    const stats = el('div', 'stat-row');
    stats.append(
      statCard('Par time', this.lv.par, ICON.clock()),
      statCard('Gold time', this.lv.gold, ICON.trophy(), this.lv.goldCard),
      statCard('Your best', this.lv.best, ICON.sparkle(), this.lv.bestCard),
    );
    detail.append(this.lv.num, nameRow, this.lv.place, this.lv.hint, stats);

    const preview = el('div', 'levels-preview');
    const frame = el('div', 'preview-frame');
    frame.append(this.lv.canvas, el('div', 'preview-tag', 'Course plan'));
    const legend = el('div', 'preview-legend');
    legend.append(
      legendItem('start', 'Start'),
      legendItem('end', 'Finish'),
      legendItem('gem', 'Gem'),
      legendItem('power', 'Powerup'),
    );
    preview.append(frame, legend);

    body.append(detail, preview);

    const foot = el('div', 'plate-foot');
    const nav = el('div', 'nav-row');
    nav.append(
      iconButton('mb-btn arrow', '', ICON.left(), () => this.step(-1)),
      iconButton('mb-btn primary wide', 'Play', ICON.play(), () => {
        this.deps.onBlip();
        this.deps.onPlay(this.selected);
      }),
      iconButton('mb-btn arrow', '', ICON.right(), () => this.step(1)),
    );
    foot.append(this.lv.chips, nav);

    plate.append(head, body, foot);
    screen.append(plate);
    return screen;
  }

  /** Repaint every level-select node from the current selection. */
  private refreshSelection(notify: boolean) {
    const levels = this.deps.levels;
    const def = this.selected;
    if (!def) return;
    const bests = this.deps.getBests();
    const best = bests[def.id];

    this.lv.counter.textContent = `${this.selectedIndex + 1} / ${levels.length}`;
    this.lv.num.textContent = `Course ${String(this.selectedIndex + 1).padStart(2, '0')} · ${DIFFICULTY_LABEL[def.difficulty]}`;
    this.lv.num.dataset.difficulty = def.difficulty;
    this.lv.name.textContent = def.name;
    this.lv.place.textContent = def.place;
    this.lv.hint.textContent = def.hint;
    this.lv.par.textContent = formatTime(def.parTime);
    this.lv.gold.textContent = def.goldTime !== undefined ? formatTime(def.goldTime) : '—';
    this.lv.best.textContent = best !== undefined ? formatTime(best) : '— — : — —';

    const gold = best !== undefined && def.goldTime !== undefined && best <= def.goldTime;
    const par = best !== undefined && best <= def.parTime;
    this.lv.bestCard.classList.toggle('is-gold', gold);
    this.lv.bestCard.classList.toggle('is-par', !gold && par);
    this.lv.goldCard.classList.toggle('is-gold', gold);
    this.lv.medal.replaceChildren();
    if (gold) {
      const m = el('span', 'medal gold');
      m.append(ICON.trophy(), el('span', undefined, 'Gold'));
      this.lv.medal.append(m);
    } else if (best !== undefined) {
      const m = el('span', `medal ${par ? 'par' : 'cleared'}`);
      m.append(el('span', undefined, par ? 'Under par' : 'Cleared'));
      this.lv.medal.append(m);
    }

    // Direct selection chips.
    this.lv.chips.replaceChildren();
    levels.forEach((l, i) => {
      const b = el('button', 'chip');
      b.type = 'button';
      b.textContent = String(i + 1);
      b.title = l.name;
      b.classList.toggle('active', i === this.selectedIndex);
      const lBest = bests[l.id];
      if (lBest !== undefined) {
        b.classList.add(l.goldTime !== undefined && lBest <= l.goldTime ? 'gold' : 'cleared');
      }
      b.addEventListener('click', () => {
        this.deps.onBlip();
        this.select(i);
      });
      this.lv.chips.append(b);
    });
    this.lv.chips.classList.toggle('single', levels.length < 2);

    // The canvas has no layout until the screen is visible, so defer a frame
    // when we are painting into a screen that was just shown.
    if (this.view === 'levels') requestAnimationFrame(() => drawLevelMap(this.lv.canvas, def));

    if (notify) this.deps.onPreview(def);
  }

  // ---------------------------------------------------------------- pause

  private pauseStats = el('div', 'pause-stats');

  private buildPause(): HTMLElement {
    const screen = el('div', 'screen screen-pause');
    const plate = el('div', 'plate pause-plate');
    plate.append(el('div', 'plate-eyebrow', 'Paused'), this.pauseStats);

    const buttons = el('div', 'stack');
    buttons.append(
      iconButton('mb-btn primary', 'Resume', ICON.play(), () => {
        this.deps.onBlip();
        this.deps.onResume();
      }),
      iconButton('mb-btn', 'Restart course', ICON.restart(), () => {
        this.deps.onBlip();
        this.deps.onRestart();
      }),
      iconButton('mb-btn', 'Settings', ICON.gear(), () => {
        this.deps.onBlip();
        this.openOverlay('settings');
      }),
      iconButton('mb-btn', 'Course select', ICON.list(), () => {
        this.deps.onBlip();
        this.deps.onExitToMenu('levels');
      }),
      iconButton('mb-btn ghost', 'Main menu', ICON.back(), () => {
        this.deps.onBlip();
        this.deps.onExitToMenu('menu');
      }),
    );
    plate.append(buttons);
    screen.append(plate);
    return screen;
  }

  /** Called when the pause menu opens, with the run so far. */
  setPauseStats(def: LevelDef, clock: number, gems: number, gemsTotal: number) {
    this.pauseStats.replaceChildren();
    this.pauseStats.append(el('div', 'pause-level', def.name));
    const row = el('div', 'pause-row');
    row.append(
      miniStat('Time', formatTime(clock)),
      miniStat('Gems', `${gems}/${gemsTotal}`),
      miniStat('Par', formatTime(def.parTime)),
    );
    this.pauseStats.append(row);
  }

  // -------------------------------------------------------------- results

  private buildResults(): HTMLElement {
    const screen = el('div', 'screen screen-results');
    screen.append(this.results);
    return screen;
  }

  showResults(data: ResultsData) {
    const { def, ms, gems, gemsTotal, previousBest } = data;
    const beatGold = def.goldTime !== undefined && ms <= def.goldTime;
    const beatPar = ms <= def.parTime;
    const improved = previousBest === undefined || ms < previousBest;

    this.results.replaceChildren();
    this.results.classList.toggle('is-gold', beatGold);

    this.results.append(el('div', 'plate-eyebrow', `${def.name} · ${def.place}`));
    this.results.append(
      el('h2', 'result-head', beatGold ? 'Gold Time' : beatPar ? 'Under Par' : 'Course Complete'),
    );

    const timeRow = el('div', 'result-time-row');
    timeRow.append(el('div', 'result-time', formatTime(ms)));
    const badges = el('div', 'badges');
    if (beatGold) badges.append(badge('gold', 'Gold'));
    else if (beatPar) badges.append(badge('par', 'Under par'));
    if (improved) badges.append(badge('best', previousBest === undefined ? 'First clear' : 'New best'));
    if (gemsTotal > 0 && gems >= gemsTotal) badges.append(badge('gems', 'All gems'));
    timeRow.append(badges);
    this.results.append(timeRow);

    this.results.append(parBar(def, ms));

    const rows = el('div', 'result-rows');
    rows.append(resultRow('Par time', formatTime(def.parTime), beatPar ? 'good' : 'bad'));
    if (def.goldTime !== undefined) {
      rows.append(resultRow('Gold time', formatTime(def.goldTime), beatGold ? 'good' : undefined));
    }
    rows.append(
      resultRow(
        'Gems',
        `${gems}/${gemsTotal}`,
        gemsTotal > 0 && gems >= gemsTotal ? 'good' : undefined,
      ),
    );
    if (previousBest !== undefined) {
      const delta = ms - previousBest;
      const sign = delta < 0 ? '−' : '+';
      rows.append(
        resultRow(
          'Previous best',
          `${formatTime(previousBest)}   ${sign}${formatTime(Math.abs(delta))}`,
          delta < 0 ? 'good' : 'bad',
        ),
      );
    } else {
      rows.append(resultRow('Previous best', 'None — this is it', 'good'));
    }
    this.results.append(rows);

    const idx = this.deps.levels.indexOf(def);
    const next = idx >= 0 ? this.deps.levels[idx + 1] : undefined;
    const row = el('div', 'nav-row');
    if (next) {
      row.append(
        iconButton('mb-btn primary wide', 'Next course', ICON.play(), () => {
          this.deps.onBlip();
          this.select(idx + 1);
          this.deps.onPlay(next);
        }),
      );
      row.append(
        iconButton('mb-btn', 'Retry', ICON.restart(), () => {
          this.deps.onBlip();
          this.deps.onPlay(def);
        }),
      );
    } else {
      row.append(
        iconButton('mb-btn primary wide', beatGold ? 'Run it again' : 'Beat your time', ICON.restart(), () => {
          this.deps.onBlip();
          this.deps.onPlay(def);
        }),
      );
    }
    row.append(
      iconButton('mb-btn ghost', 'Courses', ICON.list(), () => {
        this.deps.onBlip();
        this.deps.onExitToMenu('levels');
      }),
    );
    this.results.append(row);

    this.setView('results');
  }

  // ------------------------------------------------------------- settings

  private buildSettings(): HTMLElement {
    const overlay = el('div', 'overlay');
    const plate = el('div', 'plate settings-plate');
    const s = this.deps.settings;

    const head = el('div', 'plate-head');
    head.append(el('div', 'plate-title', 'Settings'), el('div', 'plate-count', ''));
    plate.append(head);

    const list = el('div', 'settings-list');

    list.append(
      slider('Mouse sensitivity', s.data.sensitivity, (v) => s.set('sensitivity', v), (v) =>
        `${Math.round(v * 100)}%`,
      ),
    );
    list.append(
      toggleRow('Invert look (Y)', s.data.invertY, (v) => s.set('invertY', v), 'Pulling down looks up'),
    );
    list.append(
      slider('Master volume', s.data.volume, (v) => s.set('volume', v), (v) => `${Math.round(v * 100)}%`),
    );
    list.append(toggleRow('Mute', s.data.muted, (v) => s.set('muted', v)));
    list.append(
      segmented<Quality>(
        'Graphics',
        ['low', 'medium', 'high'],
        ['Low', 'Medium', 'High'],
        s.data.quality,
        (v) => s.set('quality', v),
        'Shadows and render resolution',
      ),
    );
    list.append(toggleRow('Show FPS', s.data.showFps, (v) => s.set('showFps', v)));

    plate.append(list);

    const foot = el('div', 'nav-row');
    foot.append(
      button('mb-btn primary wide', 'Done', () => {
        this.deps.onBlip();
        this.closeOverlay();
      }),
    );
    plate.append(foot);
    overlay.append(plate);
    return overlay;
  }

  private buildControls(): HTMLElement {
    const overlay = el('div', 'overlay');
    const plate = el('div', 'plate controls-plate');
    const head = el('div', 'plate-head');
    head.append(el('div', 'plate-title', 'Controls'), el('div', 'plate-count', ''));
    plate.append(head);

    const grid = el('div', 'keys');
    for (const [keys, what] of CONTROLS) {
      const row = el('div', 'key-row');
      const chips = el('div', 'key-chips');
      for (const part of keys.split(' ')) {
        if (part === '|') chips.append(el('span', 'key-or', 'or'));
        else chips.append(el('kbd', undefined, part));
      }
      row.append(chips, el('div', 'key-what', what));
      grid.append(row);
    }
    plate.append(grid);

    plate.append(
      el(
        'p',
        'controls-note',
        'Click the game to lock the mouse. Escape releases it and pauses.',
      ),
    );

    const foot = el('div', 'nav-row');
    foot.append(
      button('mb-btn primary wide', 'Done', () => {
        this.deps.onBlip();
        this.closeOverlay();
      }),
    );
    plate.append(foot);
    overlay.append(plate);
    return overlay;
  }

  // ------------------------------------------------------------ selection io

  private loadSelection(): number {
    try {
      const id = localStorage.getItem(SELECTED_KEY);
      const i = this.deps.levels.findIndex((l) => l.id === id);
      return i >= 0 ? i : 0;
    } catch {
      return 0;
    }
  }

  private saveSelection() {
    try {
      localStorage.setItem(SELECTED_KEY, this.selected?.id ?? '');
    } catch {
      // Ignore: a lost selection is not worth a crash.
    }
  }
}

// -------------------------------------------------------------- components

/** Pass `card` to fill a retained node, so class toggles on it survive. */
function statCard(
  label: string,
  value: HTMLElement,
  icon: SVGElement,
  card = el('div', 'stat-card'),
): HTMLElement {
  const head = el('div', 'stat-label');
  head.append(icon, el('span', undefined, label));
  card.replaceChildren(head, value);
  return card;
}

function miniStat(label: string, value: string): HTMLElement {
  const node = el('div', 'mini-stat');
  node.append(el('div', 'mini-label', label), el('div', 'mini-value', value));
  return node;
}

function legendItem(kind: string, label: string): HTMLElement {
  const item = el('div', 'legend-item');
  const swatch = el('span', `legend-dot ${kind}`);
  item.append(swatch, el('span', undefined, label));
  return item;
}

function badge(kind: string, text: string): HTMLElement {
  return el('span', `badge ${kind}`, text);
}

function resultRow(label: string, value: string, tone?: string): HTMLElement {
  const row = el('div', 'result-line');
  row.append(el('span', 'k', label), el('span', `v${tone ? ` ${tone}` : ''}`, value));
  return row;
}

/**
 * A single bar that answers "how close was that?" at a glance: the run is drawn
 * against the gold and par marks on one shared scale, which a table of three
 * times never manages to convey.
 */
function parBar(def: LevelDef, ms: number): HTMLElement {
  const gold = def.goldTime ?? def.parTime * 0.6;
  const span = Math.max(def.parTime * 1.35, ms * 1.1, gold * 1.8);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / span) * 100))}%`;

  const wrap = el('div', 'par-bar');
  const track = el('div', 'track');
  const goldZone = el('div', 'zone gold');
  goldZone.style.width = pct(gold);
  const parZone = el('div', 'zone par');
  parZone.style.left = pct(gold);
  parZone.style.width = `${Math.max(0, (def.parTime - gold) / span) * 100}%`;
  const fill = el('div', 'you-fill');
  fill.style.width = pct(ms);
  track.append(goldZone, parZone, fill);

  const goldMark = el('div', 'mark gold');
  goldMark.style.left = pct(gold);
  goldMark.append(el('span', undefined, 'Gold'));
  const parMark = el('div', 'mark par');
  parMark.style.left = pct(def.parTime);
  parMark.append(el('span', undefined, 'Par'));
  const you = el('div', 'mark you');
  you.style.left = pct(ms);
  you.append(el('span', undefined, 'You'));

  wrap.append(track, goldMark, parMark, you);
  return wrap;
}

function slider(
  label: string,
  value: number,
  onChange: (v: number) => void,
  format: (v: number) => string,
): HTMLElement {
  const row = el('div', 'setting-row');
  const head = el('div', 'setting-head');
  const readout = el('div', 'setting-value', format(value));
  head.append(el('div', 'setting-label', label), readout);

  const input = el('input', 'range');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(value);
  const paint = () => {
    const v = Number(input.value);
    input.style.setProperty('--fill', `${v * 100}%`);
    readout.textContent = format(v);
  };
  paint();
  input.addEventListener('input', () => {
    paint();
    onChange(Number(input.value));
  });

  row.append(head, input);
  return row;
}

function toggleRow(
  label: string,
  value: boolean,
  onChange: (v: boolean) => void,
  note?: string,
): HTMLElement {
  const row = el('div', 'setting-row inline');
  const text = el('div');
  text.append(el('div', 'setting-label', label));
  if (note) text.append(el('div', 'setting-note', note));

  const t = el('button', 'toggle');
  t.type = 'button';
  t.setAttribute('aria-pressed', String(value));
  t.append(el('span', 'knob'));
  let on = value;
  t.addEventListener('click', () => {
    on = !on;
    t.setAttribute('aria-pressed', String(on));
    onChange(on);
  });

  row.append(text, t);
  return row;
}

function segmented<T extends string>(
  label: string,
  values: T[],
  labels: string[],
  current: T,
  onChange: (v: T) => void,
  note?: string,
): HTMLElement {
  const row = el('div', 'setting-row inline');
  const text = el('div');
  text.append(el('div', 'setting-label', label));
  if (note) text.append(el('div', 'setting-note', note));

  const group = el('div', 'segmented');
  const buttons: HTMLButtonElement[] = [];
  values.forEach((v, i) => {
    const b = el('button', 'seg');
    b.type = 'button';
    b.textContent = labels[i];
    b.classList.toggle('active', v === current);
    b.addEventListener('click', () => {
      for (const other of buttons) other.classList.remove('active');
      b.classList.add('active');
      onChange(v);
    });
    buttons.push(b);
    group.append(b);
  });

  row.append(text, group);
  return row;
}
