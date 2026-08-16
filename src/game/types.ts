export type Vec3 = [number, number, number];

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/** Named surface from SURFACES in engine/physics. */
export type SurfaceName =
  | 'default'
  | 'ice'
  | 'slick'
  | 'lowFriction'
  | 'tarmac'
  | 'cobblestone'
  | 'grass'
  | 'highFriction'
  | 'rampYellow'
  | 'sand'
  | 'carpet'
  | 'water'
  | 'steel'
  | 'bounceFloor';

/** Visual texture, independent of physical surface. */
export type TextureName =
  | 'concrete'
  | 'brick'
  | 'cobblestone'
  | 'steel'
  | 'steelPainted'
  | 'grass'
  | 'water'
  | 'asphalt'
  | 'glass'
  | 'wood'
  | 'rust'
  | 'ice'
  | 'sandstone'
  | 'yellowRamp'
  | 'incline';

export interface BlockBase {
  pos: Vec3;
  /** Euler XYZ in radians. */
  rot?: Vec3;
  surface?: SurfaceName;
  texture?: TextureName;
  /** Texture repeats per world unit. Defaults to 1. */
  uvScale?: number;
  /** Purely decorative: skipped by the collision build. */
  noCollide?: boolean;
  /** Flat colour tint multiplied over the texture. */
  color?: string;
}

export interface BoxBlock extends BlockBase {
  kind: 'box';
  size: Vec3;
}

/** A wedge: full height at one end, zero at the other, sloping along +X. */
export interface RampBlock extends BlockBase {
  kind: 'ramp';
  size: Vec3;
}

export interface CylinderBlock extends BlockBase {
  kind: 'cylinder';
  radius: number;
  height: number;
  segments?: number;
}

/** A curved road/track segment, swept around a vertical axis. */
export interface ArcBlock extends BlockBase {
  kind: 'arc';
  /** Centreline radius. */
  radius: number;
  /** Sweep in radians. */
  angle: number;
  width: number;
  thickness: number;
  /** Rise over the sweep, for helical ramps. */
  rise?: number;
  segments?: number;
  /** Bank angle in radians at the outer edge. */
  bank?: number;
}

export type Block = BoxBlock | RampBlock | CylinderBlock | ArcBlock;

export type PowerupType =
  | 'superSpeed'
  | 'superJump'
  | 'superBounce'
  | 'shockAbsorber'
  | 'gyrocopter'
  | 'megaMarble';

export interface EntityBase {
  pos: Vec3;
  rot?: Vec3;
}

export interface GemEntity extends EntityBase {
  kind: 'gem';
  /** Gems can be grouped; a level may require only one group. */
  group?: string;
}

export interface PadEntity extends EntityBase {
  kind: 'startPad' | 'endPad';
}

export interface PowerupEntity extends EntityBase {
  kind: 'powerup';
  type: PowerupType;
}

export interface TimeTravelEntity extends EntityBase {
  kind: 'timeTravel';
  /** Seconds removed from the clock. */
  seconds?: number;
}

export interface HazardEntity extends EntityBase {
  kind: 'hazard';
  type: 'mine' | 'trapdoor' | 'bumper' | 'fan' | 'oilDrum';
  /** Trapdoor size / fan range, meaning depends on type. */
  size?: Vec3;
  strength?: number;
}

/** A platform that moves along a path, carrying the marble with it. */
export interface MoverEntity extends EntityBase {
  kind: 'mover';
  size: Vec3;
  /** Waypoints relative to `pos`. */
  path: Vec3[];
  /** Seconds for a full there-and-back cycle. */
  period: number;
  surface?: SurfaceName;
  texture?: TextureName;
  /** Wait at each waypoint, in seconds. */
  dwell?: number;
  /** Spin about local Y, radians/sec. */
  spin?: number;
}

export interface CheckpointEntity extends EntityBase {
  kind: 'checkpoint';
}

/** Decorative Pittsburgh landmark, no gameplay effect. */
export interface PropEntity extends EntityBase {
  kind: 'prop';
  type: string;
  scale?: number;
}

export type Entity =
  | GemEntity
  | PadEntity
  | PowerupEntity
  | TimeTravelEntity
  | HazardEntity
  | MoverEntity
  | CheckpointEntity
  | PropEntity;

export interface SkyDef {
  /** Gradient endpoints for the sky dome. */
  top: string;
  bottom: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sunDir: Vec3;
  sunColor: string;
  ambient: string;
  /** Optional distant city silhouette band. */
  skyline?: 'downtown' | 'hills' | 'rivers' | 'none';
}

export interface LevelDef {
  id: string;
  name: string;
  /** The Pittsburgh place this level is set in. */
  place: string;
  hint: string;
  difficulty: Difficulty;
  /** Par time in ms. */
  parTime: number;
  /** Gold time in ms; beating it earns the gold marble. */
  goldTime?: number;
  spawn: { pos: Vec3; yaw: number };
  sky: SkyDef;
  blocks: Block[];
  entities: Entity[];
  /** Below this Y the marble is out of bounds. */
  killY?: number;
}
