import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, downtownSkyline, facadeRow, lampRow, slopeDeck, stairFlight } from './helpers';

/**
 * Level 6 — The Mount Washington Steps.
 *
 * One idea: ice, and what ice actually does here. Friction 0.03 leaves the
 * control torque almost nothing to push against: the marble can only manage
 * about 0.4 m/s^2 of steering or acceleration, against the 14 it gets on
 * stone. It can still brake, because braking drives the contact point to rest
 * without going through the surface, and it can still jump, because a jump is
 * an impulse along the contact normal.
 *
 * So ice is not "slippery" here. Ice is a stretch of level where your heading
 * is already decided. Every patch in this level is a commitment you make
 * before you reach it, and the grippy stone between patches is the only place
 * you are allowed to change your mind.
 *
 *   1. Sycamore Street. Three ice patches, each one followed by a ploughed
 *      drift you have to already be lined up past. Walls on both sides: this
 *      is where the rule is taught and it costs nothing to learn.
 *   2. The city steps. Four flights of gritted concrete switchbacking up the
 *      hillside. The landings are stone where you turn and ice on the far
 *      side, so overshooting the turn is what puts you on ice — and the
 *      handrail that catches you is removed one landing at a time.
 *   3. Grandview Avenue. Iced pavement along the cliff, narrowing 5.5 → 3.5 →
 *      2.8 as the railing runs out, with a three-unit break in it. The last
 *      stretch is iced end to end: you land the jump on the line you take to
 *      the overlook, or you do not take it.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

const SNOW = '#dfe7ee';
const FLIGHT_RUN = 15;
const FLIGHT_RISE = 6; // 21.8 degrees, shared by every flight

type Edge = '-x' | '+x' | '-z' | '+z';

/** An ice slab. Kept as its own helper so every patch reads the same on screen. */
const ice = (c: Vec3, size: Vec3): Block => box(c, size, 'ice', 'ice', { color: SNOW });

/** A ploughed drift. 1.6 tall, which is above the 1.4 a flat jump clears. */
const drift = (c: Vec3, size: Vec3): Block =>
  box(c, size, 'ice', 'highFriction', { color: '#f4f8fb' });

/**
 * A switchback landing: stone on the half you turn on, ice on the half beyond
 * it. `dir` is the direction the flights leave in, so "beyond" is the far edge.
 */
function landing(c: Vec3, sx: number, sz: number, dir: number, iceDepth: number, rails: Edge[]): Block[] {
  const stoneDepth = sz - iceDepth;
  const out: Block[] = [
    box(
      [c[0], c[1] - 0.3, c[2] - dir * (sz / 2 - stoneDepth / 2)],
      [sx, 0.6, stoneDepth],
      'concrete',
      'cobblestone',
      { color: '#c3c8cc' },
    ),
    ice([c[0], c[1] - 0.3, c[2] + dir * (sz / 2 - iceDepth / 2)], [sx, 0.6, iceDepth]),
  ];
  const h = 0.8;
  for (const side of rails) {
    if (side === '-x') out.push(box([c[0] - sx / 2 - 0.2, c[1] + h / 2, c[2]], [0.4, h, sz], 'steel', 'steel'));
    if (side === '+x') out.push(box([c[0] + sx / 2 + 0.2, c[1] + h / 2, c[2]], [0.4, h, sz], 'steel', 'steel'));
    if (side === '-z') out.push(box([c[0], c[1] + h / 2, c[2] - sz / 2 - 0.2], [sx, h, 0.4], 'steel', 'steel'));
    if (side === '+z') out.push(box([c[0], c[1] + h / 2, c[2] + sz / 2 + 0.2], [sx, h, 0.4], 'steel', 'steel'));
  }
  return out;
}

/**
 * Rails along one Z-facing edge, skipping the stretches a flight leaves
 * through. Without them there is a one-unit notch between two stair mouths
 * that a 0.4-wide marble drops straight through — an invisible death.
 */
function edgeRails(x0: number, x1: number, y: number, z: number, gaps: Array<[number, number]>): Block[] {
  const out: Block[] = [];
  let cursor = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 - cursor > 0.2) out.push(box([(cursor + g0) / 2, y + 0.4, z], [g0 - cursor, 0.8, 0.4], 'steel', 'steel'));
    cursor = Math.max(cursor, g1);
  }
  if (x1 - cursor > 0.2) out.push(box([(cursor + x1) / 2, y + 0.4, z], [x1 - cursor, 0.8, 0.4], 'steel', 'steel'));
  return out;
}

// ---------------------------------------------- beat 1: Sycamore Street, iced
// Nine units wide, the same width as the landing it runs into, so there is no
// lip and no hole where the street becomes the stair.
// The street is cut into alternating slabs rather than patched over one, so
// there is exactly one surface under the marble at any point.
const STREET: Array<[number, number, boolean]> = [
  [-60, -50, false],
  [-50, -44, true], // six units of committed heading
  [-44, -36, false],
  [-36, -29, true], // seven
  [-29, -22, false],
  [-22, -13, true], // nine
  [-13, -4.5, false],
];
for (const [x0, x1, iced] of STREET) {
  const c: Vec3 = [(x0 + x1) / 2, -0.5, -18];
  const sz: Vec3 = [x1 - x0, 1, 9];
  blocks.push(iced ? ice(c, sz) : box(c, sz, 'cobblestone', 'cobblestone'));
}
blocks.push(
  box([-60.5, 1.2, -18], [1, 3.4, 9], 'brick', 'default'),
  box([-32, 1.2, -22.9], [56, 3.4, 1], 'brick', 'default'),
  box([-32, 1.2, -13.1], [56, 3.4, 1], 'brick', 'default'),
);
blocks.push(...facadeRow([-56, 0, -29], [1, 0, 0], 6, 10, 9));
blocks.push(...facadeRow([-56, 0, -7], [1, 0, 0], 6, 10, 9));
blocks.push(...lampRow([-52, 0, -13.9], [1, 0, 0], 5, 11));

// Each drift sits two units past the end of the patch that commits you to a
// lane, and each leaves a 4.8-unit gap on one side.
blocks.push(
  drift([-40.25, 0.8, -20.4], [3.5, 1.6, 4.2]),
  drift([-25.25, 0.8, -15.6], [3.5, 1.6, 4.2]),
  drift([-9.25, 0.8, -18], [3.5, 1.6, 3.4]),
);

entities.push(
  { kind: 'startPad', pos: [-56, 0, -18] },
  { kind: 'gem', pos: [-51, 0.5, -18] },
  { kind: 'gem', pos: [-39, 0.5, -15.2] },
  { kind: 'gem', pos: [-24, 0.5, -20.8] },
  { kind: 'gem', pos: [-11, 0.5, -14.6] },
);

// --------------------------------------------------- beat 2: the city steps
const FLIGHTS = [
  { x: 0, w: 5 },
  { x: 6, w: 5 },
  { x: 12, w: 4.4 },
  { x: 18, w: 4.4 },
];
const mouth = (i: number): [number, number] => [
  FLIGHTS[i].x - FLIGHTS[i].w / 2,
  FLIGHTS[i].x + FLIGHTS[i].w / 2,
];

// The foot landing is walled on three sides on purpose: it is where a player
// who took the street flat out finds out what the ice cost, without paying.
blocks.push(...landing([0, 0, -18], 9, 9, -1, 2.5, ['+x', '-z']));
blocks.push(...edgeRails(-4.5, 4.5, 0, -13.7, [mouth(0)]));

// Ice grows and railings go, one landing at a time.
const LANDING_ICE = [3, 3.8, 4.6, 5.4];
const LANDING_RAILS: Edge[][] = [
  ['-x', '+x', '+z'], // caged
  ['+x', '-z'], // downhill rail gone
  ['+x'], // only the uphill rail left
  [], // nothing at all
];

for (let i = 0; i < FLIGHTS.length; i++) {
  const f = FLIGHTS[i];
  const dir = i % 2 === 0 ? 1 : -1;
  const z0 = dir > 0 ? -14 : 1;
  const z1 = z0 + dir * FLIGHT_RUN;
  const y0 = FLIGHT_RISE * i;

  blocks.push(
    ...stairFlight([f.x, y0, z0], [f.x, y0 + FLIGHT_RISE, z1], f.w, 13, 'concrete', 'cobblestone'),
  );
  // Cheek walls. A flight is the only reliable grip in the level; losing it
  // sideways would be a death the player could not have read coming.
  for (const dz of [-f.w / 2 - 0.3, f.w / 2 + 0.3]) {
    blocks.push(
      slopeDeck([f.x + dz, y0 + 0.7, z0], [f.x + dz, y0 + FLIGHT_RISE + 0.7, z1], 0.5, 1.5, 'concrete', 'default'),
    );
  }

  // The landing is sized around this stair mouth and the next one — or, at the
  // top, around the ramp up to Grandview — so no flight ever overhangs it.
  const inM = mouth(i);
  const outM: [number, number] = i + 1 < FLIGHTS.length ? mouth(i + 1) : [15.8, 24];
  const lx0 = Math.min(inM[0], outM[0]) - 1;
  const lx1 = Math.max(inM[1], outM[1]) + 1;
  const c: Vec3 = [(lx0 + lx1) / 2, y0 + FLIGHT_RISE, z1 + dir * 4];

  blocks.push(...landing(c, lx1 - lx0, 9, dir, LANDING_ICE[i], LANDING_RAILS[i]));
  const gaps: Array<[number, number]> = i + 1 < FLIGHTS.length ? [inM, outM] : [inM];
  blocks.push(...edgeRails(lx0, lx1, c[1], c[2] - dir * 4.7, gaps));

  // The landing gem goes on the middle of the stone half. A gem out on the
  // ice would be a gem you cannot turn around from, which is the one thing
  // this level must never ask for.
  const stoneCz = c[2] - dir * (4.5 - (9 - LANDING_ICE[i]) / 2);
  entities.push(
    { kind: 'gem', pos: [f.x, y0 + FLIGHT_RISE / 2 + 0.5, (z0 + z1) / 2] },
    { kind: 'gem', pos: [c[0], c[1] + 0.5, stoneCz] },
  );
}

// -------------------------------------------- beat 3: Grandview Avenue, iced
// The ramp arrives heading uphill and the pavement runs across it, so the
// first stretch of Grandview is stone: you are allowed one turn up here.
blocks.push(
  slopeDeck([25, FLIGHT_RISE * 4, -16], [34.9, 28, -16], 5, 0.6, 'concrete', 'cobblestone'),
);

/**
 * Pavement segments as [z start, z end, width, iced]. The uphill edge stays at
 * x = 40.5 against the houses; the cliff edge is what creeps in.
 */
const PAVE: Array<[number, number, number, boolean]> = [
  [-21, -12, 5.5, false], // stone: the turn out of the stair
  [-12, -2, 5.5, true],
  [-2, 8, 3.5, true],
  [8, 14, 3.5, false], // stone: line up the jump
  [17, 29, 2.8, true], // and then twelve units of no second chances
];
for (const [z0, z1, w, iced] of PAVE) {
  const c: Vec3 = [40.5 - w / 2, 27.7, (z0 + z1) / 2];
  const s: Vec3 = [w, 0.6, z1 - z0];
  blocks.push(iced ? ice(c, s) : box(c, s, 'concrete', 'cobblestone', { color: '#c3c8cc' }));
}
// Only the first stretch still has its railing, and a backstop where the ramp
// lands so overshooting the turn is a bounce rather than a fall.
blocks.push(
  box([35.0, 28.4, -13], [0.4, 1.2, 16], 'steel', 'steel'),
  box([37.9, 28.9, -20.7], [5.5, 1.8, 0.6], 'steel', 'steel'),
);

// The houses of Grandview, which double as the safe wall on the uphill side.
blocks.push(box([43.5, 31, 6], [6, 6, 58], 'brick', 'default', { color: '#7a5a4c' }));
blocks.push(...facadeRow([51, 28, -18], [0, 0, 1], 5, 11, 8));
blocks.push(...lampRow([40.3, 28, -14], [0, 0, 1], 4, 12));

entities.push(
  { kind: 'gem', pos: [37.8, 28.5, -7] },
  { kind: 'gem', pos: [38.8, 28.5, 5] },
  // Over the break. Jumping works fine on ice; it is the landing that will not
  // let you change your mind.
  { kind: 'gem', pos: [39.1, 29.3, 15.5] },
  { kind: 'gem', pos: [39.1, 28.5, 25] },
);

// The overlook: stone, railed, and the first grip since the break — which is
// the point. The level hands it back exactly when it is over.
blocks.push(
  box([35.25, 27.7, 34], [10.5, 0.6, 10], 'concrete', 'cobblestone'),
  box([29.8, 28.6, 34], [0.4, 1.2, 10.4], 'steel', 'steel'),
  box([35.25, 28.6, 39.4], [10.5, 1.2, 0.4], 'steel', 'steel'),
);
entities.push({ kind: 'endPad', pos: [37, 28, 34] });

// ------------------------------------------------------------- the hillside
// The wooded face of Mount Washington, the Mon, and downtown four hundred feet
// down and across it. All decoration: the only thing under the staircase is
// the reset.
for (let i = 0; i < 9; i++) {
  for (const side of [-1, 1]) {
    blocks.push(
      box([-6 + i * 5, -14 + i * 3, side * (34 + i * 2)], [6, 30, 26], 'grass', 'default', {
        noCollide: true,
        color: '#4d5647',
      }),
    );
  }
}
blocks.push(
  box([-130, -30.2, 14], [260, 0.4, 220], 'water', 'water', { noCollide: true, color: '#54646e' }),
);
blocks.push(...downtownSkyline([-160, -28, 34], 90, 17));

export const mountWashingtonLevel: LevelDef = {
  id: 'mountwashington',
  name: 'The City Steps',
  place: 'Mount Washington, up to Grandview Avenue',
  hint: 'Ice does not spin you out — it locks your heading. Choose the line before the patch, not on it.',
  difficulty: 'expert',
  parTime: 80000,
  goldTime: 50000,
  spawn: { pos: [-56, 0.5, -18], yaw: Math.PI / 2 },
  killY: -6,
  sky: {
    top: '#8496ac',
    bottom: '#e2e9ef',
    fog: '#d4dbe2',
    fogNear: 24,
    fogFar: 150,
    sunDir: [0.24, 0.62, -0.5],
    sunColor: '#eef3f8',
    ambient: '#96a3b2',
    skyline: 'downtown',
  },
  blocks,
  entities,
};
