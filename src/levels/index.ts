import type { LevelDef } from '../game/types';
import { inclineLevel } from './incline';
import { pointLevel } from './point';
import { clementeLevel } from './clemente';
import { cathedralLevel } from './cathedral';
import { kennywoodLevel } from './kennywood';
import { mountWashingtonLevel } from './mountwashington';

/**
 * Level order is the campaign order, and it is also the teaching order. Each
 * level owns one idea and hands the player to the next one having taught it:
 *
 *   incline         roll, steer, climb          beginner
 *   point           the sustained curve         intermediate
 *   clemente        the measured jump gap       intermediate
 *   cathedral       gaining height              advanced
 *   kennywood       airtime and launch          advanced
 *   mountwashington ice, and committing early   expert
 */
export const LEVELS: LevelDef[] = [
  inclineLevel,
  pointLevel,
  clementeLevel,
  cathedralLevel,
  kennywoodLevel,
  mountWashingtonLevel,
];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
