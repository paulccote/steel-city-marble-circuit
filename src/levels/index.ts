import type { LevelDef } from '../game/types';
import { inclineLevel } from './incline';

/** Level order is the campaign order. */
export const LEVELS: LevelDef[] = [inclineLevel];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}
