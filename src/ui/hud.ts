import type { Level } from '../game/level';
import { GO_TIME, POWERUPS } from '../engine/physics';
import type { PowerupType } from '../game/types';

export function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor(clamped % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(3, '0')}`;
}

const POWERUP_LABELS: Record<PowerupType, string> = {
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

export class Hud {
  readonly root = document.createElement('div');

  private timer = document.createElement('div');
  private gems = document.createElement('div');
  private gemCount = document.createElement('span');
  private powerup = document.createElement('div');
  private actives = document.createElement('div');
  private message = document.createElement('div');
  private hint = document.createElement('div');
  private place = document.createElement('div');
  private fps = document.createElement('div');

  private lastMessage = '';
  private frameTimes: number[] = [];

  constructor() {
    this.root.className = 'hud';

    this.timer.className = 'hud-timer';
    this.timer.textContent = '00:00.000';

    this.gems.className = 'hud-gems';
    const icon = document.createElement('div');
    icon.className = 'gem-icon';
    this.gems.append(icon, this.gemCount);

    this.powerup.className = 'hud-powerup';
    this.actives.className = 'hud-actives';
    this.message.className = 'hud-message';
    this.hint.className = 'hud-hint';
    this.place.className = 'hud-place';
    this.fps.className = 'hud-fps';

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

  update(level: Level, dt: number) {
    this.timer.textContent = formatTime(level.clock);
    this.timer.classList.toggle(
      'par-beaten',
      level.def.goldTime !== undefined && level.clock <= level.def.goldTime,
    );

    this.gemCount.textContent = `${level.gemsCollected}/${level.gemsTotal}`;
    this.gems.classList.toggle('complete', level.gemsCollected >= level.gemsTotal);
    this.gems.style.display = level.gemsTotal > 0 ? 'flex' : 'none';

    // Held powerup slot.
    if (level.heldPowerup) {
      this.powerup.textContent = POWERUP_LABELS[level.heldPowerup];
      this.powerup.classList.add('filled');
    } else {
      this.powerup.classList.remove('filled');
    }

    this.renderActives(level);
    this.renderMessage(level);

    this.place.textContent = `${level.def.name} — ${level.def.place}`;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > 40) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps.textContent = `FPS ${Math.round(1 / Math.max(avg, 1e-4))}`;
  }

  private renderActives(level: Level) {
    // Rebuilding this list every frame is cheap and avoids stale chips when a
    // powerup expires mid-frame.
    const wanted = level.active.map((a) => a.type).join(',');
    if (wanted !== this.lastActives) {
      this.actives.replaceChildren();
      for (const a of level.active) {
        const chip = document.createElement('div');
        chip.className = 'active-chip';
        chip.dataset.type = a.type;
        const label = document.createElement('span');
        label.textContent = POWERUP_LABELS[a.type];
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.append(document.createElement('span'));
        chip.append(label, bar);
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

  private lastActives = '';

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
      this.lastMessage = msg;
    }

    const showHint = level.phase === 'countdown' && !!level.def.hint;
    this.hint.textContent = level.def.hint;
    this.hint.classList.toggle('show', showHint);
  }

  flashPowerupUse() {
    this.powerup.classList.add('used');
    setTimeout(() => this.powerup.classList.remove('used'), 160);
  }
}
