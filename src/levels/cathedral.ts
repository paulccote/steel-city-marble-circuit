import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, deg, downtownSkyline, gemLine, lampRow, slopeDeck, stairFlight } from './helpers';

/**
 * Level 4 — The Cathedral of Learning.
 *
 * One idea: gaining height. Forty units of it, on a Late Gothic tower that
 * steps inward as it rises, exactly as the real one does.
 *
 *   1. The great stair. Twenty-three units of run for ten of rise — 23.5
 *      degrees, comfortably inside the 32 a marble can climb — so the first
 *      lesson is only "up is a thing you can do".
 *   2. The ledge spiral. Six corbelled runs around the shaft at 12.8 degrees,
 *      narrowing 3.5 → 2.8 → 2.2 units, with a gap broken into the third and
 *      fourth. A jump up a 13-degree slope only carries about five units
 *      forward, so the gaps are 3.5.
 *   3. The crown. The ledges stop and the last five units are taken as seven
 *      hops between the lantern stones, each 0.7 higher and three units
 *      further in, spiralling to the mast.
 *
 * Nothing in this level kills you. That is deliberate: it is a forty-unit
 * climb and there is no checkpoint, so the tower's own setbacks catch every
 * fall and the cost of a mistake is altitude, which is the currency the level
 * is about. Only leaving the block entirely is fatal.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

const STONE = '#c8bda4';
const SHAFT = 7; // half-width of the tower shaft
const TERRACE_Y = 10;
const ROOF_Y = 34;

// ------------------------------------------------------------ the Oakland lawn
blocks.push(
  box([0, -0.5, 0], [150, 1, 130], 'grass', 'grass', { color: '#4c6b3e' }),
  // Bigelow Boulevard along the west edge, a step below the lawn. Past its far
  // kerb there is nothing, and that kerb is the only fatal edge on the map.
  box([-80, -1.5, 0], [12, 1, 130], 'asphalt', 'tarmac'),
);

// Tree rows, which are also the chicane. Trunks collide; canopies do not.
for (let i = 0; i < 6; i++) {
  const z = i % 2 === 0 ? -9 : 9;
  const x = -62 + i * 7;
  blocks.push(
    { kind: 'cylinder', pos: [x, 2, z], radius: 0.5, height: 4, segments: 8, texture: 'wood', surface: 'default' },
    { kind: 'cylinder', pos: [x, 5.4, z], radius: 3.4, height: 4.6, segments: 10, texture: 'grass', surface: 'grass', noCollide: true, color: '#3d5f34' },
  );
}
blocks.push(...lampRow([-66, 0, -20], [1, 0, 0], 5, 12));
blocks.push(...lampRow([-66, 0, 20], [1, 0, 0], 5, 12));

entities.push(
  { kind: 'startPad', pos: [-70, 0, 0] },
  ...gemLine([-60, 0.5, 4], [-46, 0.5, -4], 2),
  { kind: 'gem', pos: [-36, 0.5, 3] },
);

// ------------------------------------------------------------- the base block
// Twenty-four units square, ten tall. Its roof is the first setback and the
// floor of everything above it.
blocks.push(
  box([0, TERRACE_Y / 2, 0], [24, TERRACE_Y, 24], 'sandstone', 'cobblestone', { color: STONE }),
);

// The Commons Room arcade: pointed openings around the base. Non-colliding, so
// the base stays a clean solid to collide against.
for (let i = 0; i < 5; i++) {
  const z = -8 + i * 4;
  for (const sx of [-1, 1]) {
    blocks.push(
      box([sx * 12.1, 3, z], [0.5, 6, 2.6], 'sandstone', 'default', { noCollide: true, color: '#3a3630' }),
      box([sx * 12.1, 6.4, z], [0.5, 1.4, 1.4], 'sandstone', 'default', {
        rot: [Math.PI / 4, 0, 0],
        noCollide: true,
        color: '#3a3630',
      }),
    );
  }
}

// ------------------------------------------------------------- beat 1: the stair
// Twenty-three of run for ten of rise. The treads are decoration over a smooth
// slope; a marble cannot climb a real riser.
blocks.push(...stairFlight([-35, 0, 0], [-12, TERRACE_Y, 0], 8, 18, 'sandstone', 'cobblestone'));
// Cheek walls, so a wandering line is turned back onto the stair instead of
// dropped off the side of it.
for (const z of [-4.4, 4.4]) {
  blocks.push(
    slopeDeck([-35, 0.9, z], [-12, TERRACE_Y + 0.9, z], 0.6, 1.6, 'sandstone', 'default', { color: STONE }),
  );
}

entities.push(
  { kind: 'gem', pos: [-29, 3.2, 0] },
  { kind: 'gem', pos: [-20, 7.2, 0] },
  { kind: 'gem', pos: [-9.5, TERRACE_Y + 0.5, -6] },
);

// ---------------------------------------------------------------- the shaft
blocks.push(
  box([0, (TERRACE_Y + ROOF_Y) / 2, 0], [SHAFT * 2, ROOF_Y - TERRACE_Y, SHAFT * 2], 'sandstone', 'cobblestone', {
    color: STONE,
  }),
);
// Buttress ribs up the faces. Pure silhouette — they are what stops a 24-unit
// stone box from reading as a 24-unit stone box.
for (const t of [-4.4, 0, 4.4]) {
  for (const [ox, oz] of [[SHAFT + 0.3, t], [-SHAFT - 0.3, t], [t, SHAFT + 0.3], [t, -SHAFT - 0.3]] as const) {
    blocks.push(
      box([ox, (TERRACE_Y + ROOF_Y) / 2 + 2, oz], [0.7, ROOF_Y - TERRACE_Y + 4, 0.7], 'sandstone', 'default', {
        noCollide: true,
        color: '#b3a892',
      }),
    );
  }
}

// -------------------------------------------------- beat 2: the ledge spiral
// Corner pads are a fixed 3.6 square hugging the shaft corner, so a run of any
// width always lands somewhere on one.
const CORNER = 8.8;
const corners: Vec3[] = [
  [-CORNER, TERRACE_Y, -CORNER],
  [-CORNER, TERRACE_Y, CORNER],
  [CORNER, TERRACE_Y, CORNER],
  [CORNER, TERRACE_Y, -CORNER],
];

/** Ledge widths per run: the spiral narrows as the exposure grows. */
const RUN_W = [3.5, 3.5, 2.8, 2.8, 2.2, 2.2];
const RUN_RISE = 4;

let level = TERRACE_Y;
for (let i = 0; i < RUN_W.length; i++) {
  const a = corners[i % 4];
  const b = corners[(i + 1) % 4];
  const w = RUN_W[i];
  const from: Vec3 = [a[0], level, a[2]];
  const to: Vec3 = [b[0], level + RUN_RISE, b[2]];

  // Corner pad at the foot of the run.
  blocks.push(box([a[0], level - 0.25, a[2]], [3.6, 0.5, 3.6], 'sandstone', 'cobblestone', { color: STONE }));

  if (i === 2 || i === 3) {
    // Runs three and four are broken. The gap is 3.5 units, measured against
    // the five a jump carries up a 13-degree slope.
    const t0 = 0.5 - 1.75 / 17.6;
    const t1 = 0.5 + 1.75 / 17.6;
    const at = (t: number): Vec3 => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    blocks.push(
      slopeDeck(from, at(t0), w, 0.5, 'sandstone', 'cobblestone', { color: STONE }),
      slopeDeck(at(t1), to, w, 0.5, 'sandstone', 'cobblestone', { color: STONE }),
    );
    entities.push({ kind: 'gem', pos: [(at(t0)[0] + at(t1)[0]) / 2, (at(t0)[1] + at(t1)[1]) / 2 + 1.1, (at(t0)[2] + at(t1)[2]) / 2] });
  } else {
    blocks.push(slopeDeck(from, to, w, 0.5, 'sandstone', 'cobblestone', { color: STONE }));
    entities.push({
      kind: 'gem',
      pos: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.55, (from[2] + to[2]) / 2],
    });
  }
  level += RUN_RISE;
}
// The last run tops out at the roof; a pad closes the spiral onto it.
blocks.push(box([CORNER, ROOF_Y - 0.25, CORNER], [3.6, 0.5, 3.6], 'sandstone', 'cobblestone', { color: STONE }));
blocks.push(
  slopeDeck([CORNER, ROOF_Y, CORNER], [SHAFT - 1, ROOF_Y, SHAFT - 1], 3, 0.5, 'sandstone', 'cobblestone', { color: STONE }),
);

// ------------------------------------------------------------ beat 3: the crown
// Seven lantern stones, each 0.7 higher than the last and three units of chord
// away. Three units at 0.7 up needs 5.7 m/s, which is what a marble carries
// off a four-unit stone, and the stones are four units square so landing long
// is as safe as landing short.
const CHORD = 3;
const STEP = 0.7;
let r = 8;
let ang = deg(45);
let y = ROOF_Y + 0.8;
for (let i = 0; i < 7; i++) {
  blocks.push(
    box([Math.cos(ang) * r, y - 0.25, Math.sin(ang) * r], [4, 0.5, 4], 'sandstone', 'cobblestone', {
      rot: [0, -ang, 0],
      color: '#d8cdb2',
    }),
  );
  if (i % 2 === 0) {
    entities.push({ kind: 'gem', pos: [Math.cos(ang) * r, y + 0.5, Math.sin(ang) * r] });
  }
  const next = r - 1.1;
  // The turn that puts the next stone exactly one chord away. As the spiral
  // tightens the turn grows, which is what makes the last hops feel inward.
  const cos = (r * r + next * next - CHORD * CHORD) / (2 * r * next);
  ang += Math.acos(Math.max(-1, Math.min(1, cos)));
  r = next;
  y += STEP;
}

// The mast. Four units square so the finish is never a coin toss.
blocks.push(box([0, y - 0.25, 0], [4.4, 0.5, 4.4], 'sandstone', 'cobblestone', { color: '#d8cdb2' }));
entities.push({ kind: 'gem', pos: [0, y + 0.5, 0] }, { kind: 'endPad', pos: [0, y, 0] });

// Corner pinnacles, floodlit, framing the crown.
for (const [px, pz] of [[-6.2, -6.2], [-6.2, 6.2], [6.2, 6.2], [6.2, -6.2]] as const) {
  blocks.push(
    box([px, ROOF_Y + 4, pz], [1.6, 8, 1.6], 'sandstone', 'default', { noCollide: true, color: '#c0b59c' }),
    box([px, ROOF_Y + 9, pz], [0.9, 2.4, 0.9], 'sandstone', 'default', { noCollide: true, color: '#c0b59c' }),
  );
}

// ---------------------------------------------------------------- Heinz Chapel
// Northeast of the lawn, where it stands. Decoration only, but it is the thing
// that tells you which lawn you are on.
blocks.push(
  box([34, 7, 40], [12, 14, 26], 'sandstone', 'default', { noCollide: true, color: '#b8ac95' }),
  box([34, 18, 32], [5, 8, 5], 'sandstone', 'default', { noCollide: true, color: '#b8ac95' }),
  box([34, 27, 32], [2.4, 12, 2.4], 'sandstone', 'default', { noCollide: true, color: '#a89c86' }),
);
blocks.push(...downtownSkyline([-250, -10, 0], 100, 3));

export const cathedralLevel: LevelDef = {
  id: 'cathedral',
  name: 'The Cathedral of Learning',
  place: 'Oakland, forty-two storeys of it',
  hint: 'Every ledge is caught by the setback below it. You lose height, not the run — keep climbing.',
  difficulty: 'advanced',
  parTime: 95000,
  goldTime: 62000,
  spawn: { pos: [-70, 0.5, 0], yaw: Math.PI / 2 },
  killY: -8,
  sky: {
    top: '#16264c',
    bottom: '#9c7186',
    fog: '#5b5673',
    fogNear: 45,
    fogFar: 260,
    sunDir: [-0.55, 0.3, -0.66],
    sunColor: '#ffcfa2',
    ambient: '#39405e',
    skyline: 'hills',
  },
  blocks,
  entities,
};
