import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, deg, downtownSkyline, facadeRow, kerb, lampRow, portalGate, slopeDeck, stairFlight } from './helpers';

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
  // Every edge that does not get a rail gets a painted line instead. The rails
  // coming off one landing at a time is the whole shape of this beat, so they
  // cannot come back — but "no rail" was being drawn as "no edge", and on a
  // white landing over a white hillside that is nothing at all.
  const railed = (e: Edge) => rails.includes(e);
  const far: Edge = dir > 0 ? '+z' : '-z';
  if (!railed('-x')) out.push(...kerb([c[0] - sx / 2, c[1], c[2] - sz / 2], [c[0] - sx / 2, c[1], c[2] + sz / 2], { solid: false }));
  if (!railed('+x')) out.push(...kerb([c[0] + sx / 2, c[1], c[2] - sz / 2], [c[0] + sx / 2, c[1], c[2] + sz / 2], { solid: false }));
  if (!railed(far)) {
    const fz = c[2] + dir * (sz / 2);
    out.push(...kerb([c[0] - sx / 2, c[1], fz], [c[0] + sx / 2, c[1], fz], { solid: false }));
  }

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
// Five fronts, not six. The sixth stood at x = -6, which put a nine-unit brick
// slab hard against the mouth of the first flight — the steps are meant to run
// between houses, not out of a doorway.
blocks.push(...facadeRow([-56, 0, -29], [1, 0, 0], 5, 10, 9));
blocks.push(...facadeRow([-56, 0, -7], [1, 0, 0], 5, 10, 9));
blocks.push(...lampRow([-52, 0, -13.9], [1, 0, 0], 5, 11));

// A brick arch over the street ten units ahead of the pad, and shop awnings
// down both sides. Non-colliding, all of it: the street is nine units wide and
// on ice a decorative pilaster that narrowed it would be a trap. Their whole
// job is to fill the frame and give the run-in a rhythm.
blocks.push(
  ...portalGate([-46, 0, -18], 3.8, 4.2, {
    texture: 'brick',
    surface: 'default',
    color: '#8d5b4a',
    thickness: 1,
    beam: 1.3,
    solid: false,
  }),
);
for (let i = 0; i < 6; i++) {
  const x = -54 + i * 8;
  blocks.push(
    box([x, 2.9, -14.5], [4.6, 0.25, 2.4], 'steelPainted', 'default', { noCollide: true, color: '#7a3f38' }),
    box([x, 2.9, -21.5], [4.6, 0.25, 2.4], 'steelPainted', 'default', { noCollide: true, color: '#3d5a6b' }),
  );
}

// Each drift sits two units past the end of the patch that commits you to a
// lane, and each leaves a 4.8-unit gap on one side.
blocks.push(
  drift([-40.25, 0.8, -20.4], [3.5, 1.6, 4.2]),
  drift([-25.25, 0.8, -15.6], [3.5, 1.6, 4.2]),
  drift([-9.25, 0.8, -18], [3.5, 1.6, 3.4]),
);

entities.push(
  { kind: 'startPad', pos: [-56, 0, -18] },
  // Grandview is a long way from the street. Losing the pavement up there used
  // to send you back down four flights of stairs; now it sends you back to the
  // top of them.
  { kind: 'checkpoint', pos: [20.9, 24, -15.3] },
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
      // Galvanised pipe on top of the wall, and a stanchion every few steps.
      // Every public stair in this city has one and it is the single cheapest
      // detail that says "steps" rather than "ramp with lines drawn on it".
      slopeDeck([f.x + dz, y0 + 2.1, z0], [f.x + dz, y0 + FLIGHT_RISE + 2.1, z1], 0.16, 0.16, 'steel', 'default', {
        noCollide: true,
        color: '#9aa1a8',
      }),
    );
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      blocks.push(
        box([f.x + dz, y0 + FLIGHT_RISE * t + 1.5, z0 + (z1 - z0) * t], [0.14, 1.2, 0.14], 'steel', 'default', {
          noCollide: true,
          color: '#9aa1a8',
        }),
      );
    }
  }
  // And the centre rail, which is the other half of the picture: these flights
  // are wide enough to need one and every one of them has it. Non-colliding —
  // a solid post down the middle of a five-unit flight on ice would be a wall.
  blocks.push(
    slopeDeck([f.x, y0 + 1.1, z0], [f.x, y0 + FLIGHT_RISE + 1.1, z1], 0.14, 0.14, 'steel', 'default', {
      noCollide: true,
      color: '#9aa1a8',
    }),
  );

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
  // Kerbs on the ramp, not paint. It runs *with* the route, it is the only way
  // up to Grandview, and it is twenty-four units above the hillside: this is
  // the one edge on the mountain where being turned back is better than being
  // told what you just fell off.
  ...kerb([25, FLIGHT_RISE * 4, -18.35], [34.9, 28, -18.35]),
  ...kerb([25, FLIGHT_RISE * 4, -13.65], [34.9, 28, -13.65]),
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
  // The cliff edge creeps in from 35 to 37.7 as the pavement narrows, and past
  // the first stretch there is no railing on it by design. Paint, then, and
  // only paint: a lip here would hand back the exposure the whole beat is made
  // of. White kerbstone against snow-white ice would say nothing, so it is the
  // dark line that carries it, exactly as it does on the bridge.
  blocks.push(...kerb([40.5 - w, 28, z0], [40.5 - w, 28, z1], { solid: false }));
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
//
// The face of Mount Washington, under the whole staircase rather than in two
// ranks of blocks off to the sides. It is defined as a straight 38-degree plane
// because that is what the mountain is: steeper than the 32 a marble can climb,
// so it could be solid and still not be a shortcut, and steep enough that the
// flights obviously switchback *because* of it. All decoration regardless — the
// only thing under the staircase is the reset.
const hillY = (x: number) => Math.min(27, -8 + (x + 10) * 0.78);
for (let x = -16; x < 46; x += 4) {
  blocks.push(
    slopeDeck([x, hillY(x), -5], [x + 4.1, hillY(x + 4.1), -5], 76, 16, 'grass', 'default', {
      noCollide: true,
      color: '#4d5647',
    }),
  );
}
// The shelf Sycamore Street is cut into. West of about x = 0 the mountain has
// dropped below street level, and without this the first sixty units of the
// level are a road on nothing.
blocks.push(
  box([-32, -8, -18], [72, 14, 34], 'grass', 'default', { noCollide: true, color: '#4a5344' }),
  box([-32, -1.4, -18], [72, 1.4, 35], 'concrete', 'default', { noCollide: true, color: '#8e9298' }),
);

/**
 * A hillside house: clapboard box, pitched roof, and the timber posts that hold
 * its downhill half up.
 *
 * This is the point of the level. Pittsburgh's city steps are not stairs in a
 * park — they are a public right of way threaded up a slope too steep to put a
 * street on, with somebody's back porch three feet from the handrail on both
 * sides. Without houses either side of every flight this is a staircase in
 * snow, and a staircase in snow is not Mount Washington.
 */
function hillHouse(x: number, z: number, ground: number, tone: number): Block[] {
  const w = 6.4;
  const d = 7.4;
  const floor = ground + 3.2;
  const wall = ['#8d7f6e', '#7a6f63', '#6f7a72', '#8a6a5a'][tone % 4];
  const out: Block[] = [
    box([x, floor + 3, z], [w, 6, d], 'wood', 'default', { noCollide: true, color: wall }),
    // Porch band and window row: two horizontal lines are what separate a
    // clapboard house from a crate.
    box([x, floor + 0.3, z], [w + 1.2, 0.5, d + 1.2], 'wood', 'default', { noCollide: true, color: '#5c5148' }),
    box([x, floor + 4.4, z], [w + 0.12, 1.5, d * 0.62], 'glass', 'default', { noCollide: true, color: '#2f3740' }),
  ];
  // Gable roof.
  const pitch = deg(34);
  const half = w / 2 + 0.5;
  const slab = half / Math.cos(pitch);
  for (const side of [-1, 1]) {
    out.push(
      box([x + (side * half) / 2, floor + 6.2 + (slab * Math.sin(pitch)) / 2, z], [slab, 0.35, d + 1], 'wood', 'default', {
        noCollide: true,
        rot: [0, 0, -side * pitch],
        color: '#4a4038',
      }),
    );
  }
  // The stilts. A house on a 38-degree slope stands on its own legs downhill,
  // and that silhouette is as much a part of these hills as the steps are.
  for (const dx of [-2.4, 2.4]) {
    for (const dz of [-2.8, 2.8]) {
      out.push(
        box([x + dx, (floor + ground - 4) / 2, z + dz], [0.4, floor - ground + 4, 0.4], 'wood', 'default', {
          noCollide: true,
          color: '#4f4337',
        }),
      );
    }
  }
  return out;
}

// Two rows of them, one either side of the staircase, stepping up the hill with
// it. Set outside the nine units the landings occupy so nothing decorative ever
// stands where a player can be.
for (let i = 0; i < 6; i++) {
  const x = -4 + i * 6;
  // Staggered in and out rather than in a straight rank. A solid row at one
  // depth is a fence: from below it hides the very staircase it is there to
  // explain, and hillside lots in this city are never that tidy anyway.
  for (const [z, t] of [[i % 2 ? -24 : -30, i], [i % 2 ? 21 : 15, i + 2]] as const) {
    blocks.push(...hillHouse(x, z, hillY(x) - 1.5, t));
  }
}
blocks.push(
  box([-130, -30.2, 14], [260, 0.4, 220], 'water', 'water', { noCollide: true, color: '#54646e' }),
);
blocks.push(...downtownSkyline([-200, -28, 55], 60, 17));

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
