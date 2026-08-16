import type { Level } from '../game/level';
import { GO_TIME, POWERUPS } from '../engine/physics';
import type { PowerupType } from '../game/types';
import { POWERUP_ICON } from './icons';
import { el } from './dom';

export function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor(clamped % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(3, '0')}`;
}

export const POWERUP_LABELS: Record<PowerupType, string> = {
  superSpeed: 'Super Speed',
  superJump: 'Super Jump',
  superBounce: 'Super Bounce',
  shockAbsorber: 'Shock Absorber',
  gyrocopter: 'Gyrocopter',
  megaMarble: 'Mega Marble',
};

const POWERUP_DURATIONS: Partial<Record<PowerupType, number>> = {
  superBounce: POWERUPS.superBounce.duration,
  shockAbsorber: POWERUPS.shockAbsorber.duration,
  gyrocopter: POWERUPS.gyrocopter.duration,
  megaMarble: POWERUPS.megaMarble.duration,
};

/** How long the level name stays on screen after entering a level, in ms. */
const PLACE_DWELL = 5000;

/**
 * The heads-up display. Marble Blast's HUD is three things — clock, gems,
 * powerup — and nothing else competes with the geometry for attention. This
 * keeps to that: everything transient (messages, level name) fades out, and
 * the persistent elements are pure high-contrast type with no panels behind
 * them.
 */
export class Hud {
  readonly root = el('div', 'hud');

  private timer = el('div', 'hud-timer');
  private gems = el('div', 'hud-gems');
  private gemCount = el('span', 'count');
  private powerup = el('div', 'hud-powerup');
  private powerupIcon = el('div', 'slot-icon');
  private actives = el('div', 'hud-actives');
  private message = el('div', 'hud-message');
  private hint = el('div', 'hud-hint');
  private place = el('div', 'hud-place');
  private fps = el('div', 'hud-fps');

  private lastMessage = '';
  private lastHeld: PowerupType | null = null;
  private lastPhase = '';
  private lastActives = '';
  private frameTimes: number[] = [];
  private showFps = true;

  constructor() {
    this.timer.textContent = '00:00.000';

    const icon = el('div', 'gem-icon');
    this.gems.append(icon, this.gemCount);

    // The slot is always drawn — an empty frame tells the player a powerup can
    // be held here, and stops the whole HUD shifting when one is picked up.
    const key = el('span', 'slot-key', 'E');
    this.powerup.append(this.powerupIcon, key);

    this.root.append(
      this.timer,
      this.gems,
      this.powerup,
      this.actives,
      this.message,
      this.hint,
      this.place,
      this.fps,
    );
  }

  show(visible: boolean) {
    this.root.classList.toggle('visible', visible);
  }

  setShowFps(show: boolean) {
    this.showFps = show;
    this.fps.style.display = show ? 'block' : 'none';
  }

  /** Called when a level starts so the level-name card replays. */
  reset() {
    this.lastMessage = '';
    this.lastHeld = null;
    this.lastPhase = '';
    this.lastActives = '';
    this.message.classList.remove('show');
    this.frameTimes.length = 0;
  }

  update(level: Level, dt: number) {
    this.timer.textContent = formatTime(level.clock);
    // Colour is the only par feedback during play: gold while a gold time is
    // still possible, red once par has slipped away.
    const gold = level.def.goldTime !== undefined && level.clock <= level.def.goldTime;
    this.timer.classList.toggle('gold', gold);
    this.timer.classList.toggle('over-par', !gold && level.clock > level.def.parTime);

    this.gemCount.textContent = `${level.gemsCollected}/${level.gemsTotal}`;
    this.gems.classList.toggle('complete', level.gemsCollected >= level.gemsTotal);
    this.gems.style.display = level.gemsTotal > 0 ? 'flex' : 'none';

    if (level.heldPowerup !== this.lastHeld) {
      // A held powerup also clears on respawn, and that must not look like a
      // use. A real use only happens between two consecutive playing frames;
      // a respawn always passes through 'dead' or 'countdown' first.
      const used =
        this.lastHeld !== null &&
        level.heldPowerup === null &&
        level.phase === 'playing' &&
        this.lastPhase === 'playing';

      this.powerupIcon.replaceChildren();
      if (level.heldPowerup) this.powerupIcon.append(POWERUP_ICON[level.heldPowerup]());
      this.powerup.classList.toggle('filled', !!level.heldPowerup);
      this.powerup.dataset.type = level.heldPowerup ?? '';
      this.lastHeld = level.heldPowerup;
      if (used) this.flashPowerupUse();
    }
    this.lastPhase = level.phase;

    this.renderActives(level);
    this.renderMessage(level);

    this.place.textContent = `${level.def.name} — ${level.def.place}`;
    this.place.classList.toggle('show', level.elapsed < PLACE_DWELL);

    if (this.showFps) {
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 40) this.frameTimes.shift();
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.fps.textContent = `FPS ${Math.round(1 / Math.max(avg, 1e-4))}`;
    }
  }

  private renderActives(level: Level) {
    // Rebuilding this list every frame is cheap and avoids stale chips when a
    // powerup expires mid-frame.
    const wanted = level.active.map((a) => a.type).join(',');
    if (wanted !== this.lastActives) {
      this.actives.replaceChildren();
      for (const a of level.active) {
        const chip = el('div', 'active-chip');
        chip.dataset.type = a.type;
        const bar = el('div', 'bar');
        bar.append(el('span'));
        chip.append(POWERUP_ICON[a.type](), el('span', 'name', POWERUP_LABELS[a.type]), bar);
        this.actives.append(chip);
      }
      this.lastActives = wanted;
    }

    for (const chip of Array.from(this.actives.children) as HTMLElement[]) {
      const type = chip.dataset.type as PowerupType;
      const a = level.active.find((x) => x.type === type);
      const total = POWERUP_DURATIONS[type] ?? 1;
      const remaining = a ? Math.max(0, a.until - level.elapsed) : 0;
      const fill = chip.querySelector('.bar span') as HTMLElement | null;
      if (fill) fill.style.width = `${(remaining / total) * 100}%`;
    }
  }

  private renderMessage(level: Level) {
    let msg = '';
    if (level.phase === 'countdown') {
      const remaining = GO_TIME - level.elapsed;
      if (remaining > 2000) msg = 'Ready';
      else if (remaining > 0) msg = 'Set';
      else msg = 'Go!';
    } else if (level.phase === 'playing' && level.elapsed < GO_TIME + 700) {
      msg = 'Go!';
    } else if (level.phase === 'dead') {
      msg = 'Out of Bounds';
    }

    if (msg !== this.lastMessage) {
      this.message.textContent = msg;
      this.message.classList.toggle('show', msg !== '');
      this.message.classList.toggle('go', msg === 'Go!');
      this.message.classList.toggle('bad', msg === 'Out of Bounds');
      // Restart the pop animation on every change.
      this.message.style.animation = 'none';
      void this.message.offsetWidth;
      this.message.style.animation = '';
      this.lastMessage = msg;
    }

    const showHint = level.phase === 'countdown' && !!level.def.hint;
    this.hint.textContent = level.def.hint;
    this.hint.classList.toggle('show', showHint);
  }

  /**
   * Pop the slot. Fired automatically from `update` when a held powerup is
   * spent; kept public so Level can call it directly if it ever grows a
   * "powerup used" callback, which would be exact rather than inferred.
   */
  flashPowerupUse() {
    this.powerup.classList.remove('used');
    // Force a reflow so a second use inside the animation window replays it.
    void this.powerup.offsetWidth;
    this.powerup.classList.add('used');
    setTimeout(() => this.powerup.classList.remove('used'), 220);
  }
}
