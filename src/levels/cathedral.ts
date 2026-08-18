import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, deg, downtownSkyline, gemLine, kerb, lampRow, portalGate, slopeDeck, stairFlight } from './helpers';

/**
 * Level 4 — The Cathedral of Learning.
 *
 * One idea: gaining height. Forty units of it, on a Late Gothic tower that
 * steps inward as it rises, exactly as the real one does.
 *
 *   1. The great stair. Twenty-three units of run for ten of rise — 23.5
 *      degrees, comfortably inside the 32 a marble can climb — so the first
 *      lesson is only "up is a thing you can do".
 *   2. The ledge spiral. Ten corbelled runs around the shaft at 12.8 degrees,
 *      narrowing 3.5 → 3.2 → 2.9 → 2.6 → 2.3 units, with a gap broken into the
 *      fifth and ninth. A jump up a 13-degree slope only carries about five
 *      units forward, so the gaps are 3.5.
 *   3. The crown. The ledges stop and the last eight units are taken as eleven
 *      hops between the lantern stones, each 0.7 higher and three units
 *      further in, spiralling to the mast.
 *
 * The proportions matter as much as the beats. This is the tallest schoolhouse
 * in the western hemisphere and its whole identity is slenderness: a 24-unit
 * base, a 14-unit shaft, and 72 units of height, which is a little over five to
 * one on the shaft. Built at 34 tall it was a stone box with ledges on it and
 * could have been any building anywhere. What makes it Gothic rather than tall
 * is the second thing: the faces are not walls but bundles of vertical piers
 * with the window bays recessed dark behind them, running unbroken from the
 * ground to the crown, so the eye is dragged up the whole height in one move.
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
const ROOF_Y = 50;

// ------------------------------------------------------------ the Oakland lawn
blocks.push(
  box([0, -0.5, 0], [150, 1, 130], 'grass', 'grass', { color: '#4c6b3e' }),
  // Bigelow Boulevard along the west edge, a step below the lawn. Past its far
  // kerb there is nothing, and that kerb is the only fatal edge on the map.
  box([-80, -1.5, 0], [12, 1, 130], 'asphalt', 'tarmac'),
);
// It was described as a kerb and built as nothing: eighty units of asphalt
// simply ending, with the same fog beyond it as beside it. Paint only, no lip —
// the level says this edge is fatal, so it stays fatal and starts being legible.
blocks.push(
  ...kerb([-85.7, -1, -65], [-85.7, -1, 65], { solid: false, bandColor: '#1e2126' }),
  ...kerb([-84.9, -1, -65], [-84.9, -1, 65], { solid: false, bandColor: '#d8c24a' }),
);

// The Fifth Avenue terrace, a step above the lawn. Small, but it means the
// opening frame has the course dropping away from the player rather than
// running flat to the horizon.
blocks.push(
  // Cobblestone, not concrete. Concrete tiles at roughly three units, so a
  // terrace paved in it reads as one blank slab across the bottom half of the
  // frame; cobble tiles at under one and reads as ground.
  box([-73, 0.75, 0], [16, 1.5, 26], 'cobblestone', 'cobblestone'),
);
blocks.push(...stairFlight([-60, 0, 0], [-65, 1.5, 0], 11, 4, 'concrete', 'cobblestone'));
// Bollards along the terrace edge: near-field verticals for the part of the
// frame the camera's pitch fills with floor whatever is on the horizon.
for (const z of [-5.4, 5.4]) {
  for (let i = 0; i < 3; i++) {
    blocks.push(
      { kind: 'cylinder', pos: [-75 + i * 4, 2, z], radius: 0.28, height: 1, segments: 8,
        texture: 'sandstone', surface: 'default', color: '#9c9282' },
    );
  }
}

// The gate onto the lawn: two stone pylons ten units ahead of the pad. At this
// camera pitch they leave the top of the frame, which is exactly what makes
// them read as a gateway rather than as two more blocks on a field.
blocks.push(
  ...portalGate([-58, 0, 0], 6.2, 6, {
    texture: 'sandstone',
    surface: 'default',
    color: '#bcae92',
    thickness: 2.2,
    beam: 1.5,
  }),
);

// A flagged walk from the gate to the foot of the stair, with a kerb either
// side, so the lawn is not one unbroken field of green.
blocks.push(box([-48, 0.05, 0], [30, 0.3, 13], 'concrete', 'cobblestone', { color: '#a8a396' }));
// Non-colliding: the tree chicane sends the line across these, so they are a
// drawn edge and not a barrier.
for (const z of [-6.4, 6.4]) {
  blocks.push(box([-48, 0.3, z], [30, 0.3, 0.6], 'sandstone', 'default', { noCollide: true, color: '#b6ab93' }));
}

// Tree rows, which are also the chicane. Trunks collide; canopies do not. Eight
// units off the line rather than nine, and thicker, so they actually sweep.
for (let i = 0; i < 7; i++) {
  const z = i % 2 === 0 ? -8 : 8;
  const x = -54 + i * 6;
  blocks.push(
    { kind: 'cylinder', pos: [x, 2.1, z], radius: 0.75, height: 4.2, segments: 8, texture: 'wood', surface: 'default' },
    { kind: 'cylinder', pos: [x, 5.8, z], radius: 3.6, height: 5, segments: 10, texture: 'grass', surface: 'grass', noCollide: true, color: '#3d5f34' },
  );
}
blocks.push(...lampRow([-52, 0, -7.6], [1, 0, 0], 5, 9));
blocks.push(...lampRow([-52, 0, 7.6], [1, 0, 0], 5, 9));

entities.push(
  { kind: 'startPad', pos: [-70, 1.5, 0] },
  // 0.75 above the flagged walk, whose surface is at 0.2. At 0.6 the gem sat
  // 0.4 clear, and 0.4 is less than the 0.43 its own point plus its bob needs.
  ...gemLine([-54, 0.75, 4], [-46, 0.75, -4], 2),
  { kind: 'gem', pos: [-38, 0.75, 3] },
);

// ------------------------------------------------------------- the base block
// Twenty-four units square, ten tall. Its roof is the first setback and the
// floor of everything above it.
blocks.push(
  box([0, TERRACE_Y / 2, 0], [24, TERRACE_Y, 24], 'sandstone', 'cobblestone', { color: STONE }),
);

// The Commons Room arcade: pointed openings around all four sides of the base,
// nearly the full ten units of its height. The Commons Room is a fifty-foot
// Gothic hall and its windows are the tallest thing at ground level, so the
// base is mostly glass between stone mullions rather than a stone plinth with
// slots in it.
for (let i = 0; i < 5; i++) {
  const t = -8 + i * 4;
  for (const [ox, oz, yaw] of [
    [12.1, t, 0],
    [-12.1, t, 0],
    [t, 12.1, Math.PI / 2],
    [t, -12.1, Math.PI / 2],
  ] as const) {
    blocks.push(
      box([ox, 4.1, oz], [0.5, 7, 2.8], 'sandstone', 'default', {
        rot: [0, yaw, 0],
        noCollide: true,
        color: '#3a3630',
      }),
      box([ox, 8, oz], [0.5, 1.5, 1.5], 'sandstone', 'default', {
        rot: [yaw === 0 ? Math.PI / 4 : 0, yaw, yaw === 0 ? 0 : Math.PI / 4],
        noCollide: true,
        color: '#3a3630',
      }),
      // The mullion splitting each opening — the detail that makes a dark slot
      // read as a window rather than a doorway.
      box([ox + (yaw === 0 ? 0.15 : 0), 4.1, oz + (yaw === 0 ? 0 : 0.15)], [0.3, 7, 0.25], 'sandstone', 'default', {
        rot: [0, yaw, 0],
        noCollide: true,
        color: '#c8bda4',
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
  // On the corner pad the spiral starts from, not at (-9.5, -6): that point is
  // inside the first ledge run, which is pinned to the shaft's west face and
  // climbs straight through it. Only the top third of the gem showed.
  { kind: 'gem', pos: [-9.5, TERRACE_Y + 0.55, -10.4] },
);

// ---------------------------------------------------------------- the shaft
blocks.push(
  box([0, (TERRACE_Y + ROOF_Y) / 2, 0], [SHAFT * 2, ROOF_Y - TERRACE_Y, SHAFT * 2], 'sandstone', 'cobblestone', {
    color: STONE,
  }),
);
// The piers. Seven to a face, running the full forty units of shaft and on
// down over the base block to the ground, with the window bay between each pair
// sunk dark behind them. Three fat ribs read as buttresses on a box; seven thin
// ones a unit and a half apart read as a Gothic tower, because the eye stops
// counting and just follows them up.
//
// They stand only 0.3 proud, which is the one number that matters: the ledge
// spiral is pinned to this same face, and anything deeper would be an obstacle
// lying along the inside edge of every run.
const PIERS = [-6, -4, -2, 0, 2, 4, 6];
for (let i = 0; i < PIERS.length; i++) {
  const t = PIERS[i];
  for (const [ox, oz, yaw] of [
    [SHAFT + 0.15, t, 0],
    [-SHAFT - 0.15, t, 0],
    [t, SHAFT + 0.15, Math.PI / 2],
    [t, -SHAFT - 0.15, Math.PI / 2],
  ] as const) {
    // The pier itself, from the lawn to just under the crown.
    blocks.push(
      box([ox, (ROOF_Y + 1.6) / 2, oz], [0.6, ROOF_Y + 1.6, 0.6], 'sandstone', 'default', {
        noCollide: true,
        rot: [0, yaw, 0],
        color: '#d3c8ae',
      }),
      // A finial where it breaks the parapet, which is what turns a rank of
      // verticals into a crown rather than a row of posts.
      box([ox, ROOF_Y + 2.6, oz], [0.95, 1.6, 0.95], 'sandstone', 'default', {
        noCollide: true,
        rot: [0, yaw, 0],
        color: '#c0b59c',
      }),
    );
    // The recessed bay to the pier's left. Dark, and only on the shaft, so the
    // base block keeps its own arcade.
    if (i > 0) {
      const m = (t + PIERS[i - 1]) / 2;
      const [bx, bz] = yaw === 0 ? [ox - Math.sign(ox) * 0.1, m] : [m, oz - Math.sign(oz) * 0.1];
      blocks.push(
        box([bx, (TERRACE_Y + ROOF_Y) / 2, bz], [0.35, ROOF_Y - TERRACE_Y, 1.4], 'sandstone', 'default', {
          noCollide: true,
          rot: [0, yaw, 0],
          color: '#4a4238',
        }),
      );
    }
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

/**
 * Trim for every ledge rim on the tower. Paint, never a lip: this level is
 * forty units of deliberate exposure and a kerb would quietly delete it. The
 * job is to make the edge visible, not to make it safe.
 */
const LEDGE_TRIM = { solid: false, bandColor: '#4b4034' } as const;

/**
 * Ledge widths per run: the spiral narrows as the exposure grows.
 *
 * Ten runs of four, not eight of five. Two constraints pick that pair. The
 * pitch has to stay at the 12.8 degrees the jump distances in this level were
 * measured against — at 16 the same 3.5-unit gap needed the jump a unit and a
 * half earlier and the window for it got mean. And the count has to leave the
 * spiral at the corner the roof ramp starts from: runs cycle through four
 * corners, so only a count of 2 mod 4 finishes on the right one. Eight runs
 * ended the climb diagonally opposite the closing pad, over open air.
 */
const RUN_W = [3.5, 3.5, 3.2, 3.2, 2.9, 2.9, 2.6, 2.6, 2.3, 2.3];
const RUN_RISE = 4;
/** Which runs are broken by a jump. Spaced so the ask is not two in a row. */
const BROKEN = [4, 8];

let level = TERRACE_Y;
for (let i = 0; i < RUN_W.length; i++) {
  const a = corners[i % 4];
  const b = corners[(i + 1) % 4];
  const w = RUN_W[i];

  // A narrow run has to be pushed back against the shaft, not left on the
  // corner-pad centreline. Otherwise the ledge's inner edge sits 8.8 - w/2 out
  // from the tower and the slot behind it is 0.7 wide — wider than the marble,
  // which would drop through a hole nobody can see from above. Whichever axis
  // the two corners share is the one that gets pinned to the wall.
  const offset = SHAFT + w / 2;
  const pin = (p: Vec3): Vec3 =>
    a[0] === b[0]
      ? [Math.sign(a[0]) * offset, p[1], p[2]]
      : [p[0], p[1], Math.sign(a[2]) * offset];

  const from = pin([a[0], level, a[2]]);
  const to = pin([b[0], level + RUN_RISE, b[2]]);

  // Corner pad at the foot of the run.
  blocks.push(box([a[0], level - 0.25, a[2]], [3.6, 0.5, 3.6], 'sandstone', 'cobblestone', { color: STONE }));
  // And a dark trim round its two outer sides, for the same reason as the runs.
  blocks.push(
    ...kerb([a[0] + Math.sign(a[0]) * 1.8, level, a[2] - 1.8], [a[0] + Math.sign(a[0]) * 1.8, level, a[2] + 1.8], LEDGE_TRIM),
    ...kerb([a[0] - 1.8, level, a[2] + Math.sign(a[2]) * 1.8], [a[0] + 1.8, level, a[2] + Math.sign(a[2]) * 1.8], LEDGE_TRIM),
  );

  // The outer rim of the run, in the same trim. A ledge two units wide, cut
  // from the same stone as the wall it is bolted to and photographed against a
  // night sky, has no edge at all until something dark is painted on it: the
  // shaft, the ledge and the drop are all one colour otherwise.
  const rim = (p: Vec3): Vec3 =>
    a[0] === b[0]
      ? [Math.sign(a[0]) * (SHAFT + w - 0.15), p[1], p[2]]
      : [p[0], p[1], Math.sign(a[2]) * (SHAFT + w - 0.15)];

  if (BROKEN.includes(i)) {
    // A broken run. The gap is 3.5 units, measured against the five a jump
    // carries up a 13-degree slope.
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
      ...kerb(rim(from), rim(at(t0)), LEDGE_TRIM),
      ...kerb(rim(at(t1)), rim(to), LEDGE_TRIM),
    );
    entities.push({ kind: 'gem', pos: [(at(t0)[0] + at(t1)[0]) / 2, (at(t0)[1] + at(t1)[1]) / 2 + 1.1, (at(t0)[2] + at(t1)[2]) / 2] });
  } else {
    blocks.push(
      slopeDeck(from, to, w, 0.5, 'sandstone', 'cobblestone', { color: STONE }),
      ...kerb(rim(from), rim(to), LEDGE_TRIM),
    );
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
  // Trim down both sides of the diagonal. It runs at 45 degrees to everything
  // else on the roof, which is exactly when an untrimmed 3-unit slab stops
  // reading as a route and starts reading as part of the roof.
  ...kerb([CORNER + 1.05, ROOF_Y, CORNER - 1.05], [SHAFT - 1 + 1.05, ROOF_Y, SHAFT - 1 - 1.05], LEDGE_TRIM),
  ...kerb([CORNER - 1.05, ROOF_Y, CORNER + 1.05], [SHAFT - 1 - 1.05, ROOF_Y, SHAFT - 1 + 1.05], LEDGE_TRIM),
);

// ------------------------------------------------------------ beat 3: the crown
// Eleven lantern stones, each 0.7 higher than the last and three units of chord
// away. Three units at 0.7 up needs 5.7 m/s, which is what a marble carries
// off a four-unit stone, and the stones are four units square so landing long
// is as safe as landing short. Eleven rather than seven: the crown is the last
// eight units of a seventy-two-unit tower, and at seven stones the taper was
// over before it had read as a taper.
const CHORD = 3;
const STEP = 0.7;
let r = 7;
let ang = deg(45);
let y = ROOF_Y + 0.8;
for (let i = 0; i < 11; i++) {
  blocks.push(
    box([Math.cos(ang) * r, y - 0.25, Math.sin(ang) * r], [4, 0.5, 4], 'sandstone', 'cobblestone', {
      rot: [0, -ang, 0],
      color: '#d8cdb2',
    }),
  );
  // No gem on the last stone: by then the spiral has wound in to a radius of
  // 1.4 and the mast's 4.4-square cap covers it, so that gem was inside solid
  // stone. The finish gem on top of the mast is two thirds of a unit above it
  // and does the same job.
  if (i % 3 === 0 && i < 10) {
    entities.push({ kind: 'gem', pos: [Math.cos(ang) * r, y + 0.55, Math.sin(ang) * r] });
  }
  const next = r - 0.5;
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

// The corner buttresses of the crown: two stepped setbacks either side of the
// lantern, then the pinnacle. The real tower does not stop, it tapers — three
// steps in over its last forty feet — and stepping the corners is the cheapest
// way to say so from the lawn.
// They stand at 8.4, corbelled a unit and a half out past the shaft face, which
// is both what a Gothic corner turret does and the only place they can go: the
// crown spiral works inside a radius of seven and anything closer would have a
// lantern stone half inside a buttress.
for (const [px, pz] of [[-8.4, -8.4], [-8.4, 8.4], [8.4, 8.4], [8.4, -8.4]] as const) {
  blocks.push(
    box([px, ROOF_Y - 3, pz], [2.6, 12, 2.6], 'sandstone', 'default', { noCollide: true, color: '#c8bda4' }),
    box([px * 0.86, ROOF_Y + 7, pz * 0.86], [1.8, 8, 1.8], 'sandstone', 'default', { noCollide: true, color: '#c0b59c' }),
    box([px * 0.72, ROOF_Y + 14, pz * 0.72], [1.1, 6, 1.1], 'sandstone', 'default', { noCollide: true, color: '#bab092' }),
    box([px * 0.72, ROOF_Y + 18.5, pz * 0.72], [0.55, 3.4, 0.55], 'sandstone', 'default', { noCollide: true, color: '#bab092' }),
  );
}
// The lantern spire over the mast, measured off the mast rather than the roof:
// it is the highest thing on the block and it is the last thing the silhouette
// needs, because a tower this slender that stops flat reads as unfinished.
blocks.push(
  box([0, y + 2.4, 0], [3, 4.4, 3], 'sandstone', 'default', { noCollide: true, color: '#c8bda4' }),
  box([0, y + 7.4, 0], [1.7, 6, 1.7], 'sandstone', 'default', { noCollide: true, color: '#bab092' }),
  box([0, y + 12.4, 0], [0.6, 4.4, 0.6], 'sandstone', 'default', { noCollide: true, color: '#b3a892' }),
);

// ---------------------------------------------------------------- Heinz Chapel
// Northeast of the lawn, where it stands. Decoration only, but it is the thing
// that tells you which lawn you are on.
// French Gothic: a narrow nave, a roof pitched far steeper than anything else
// on the block, and a spire that is nearly as tall as the nave is long. Built
// as a box with a stub on it, it read as a maintenance shed.
const CHAPEL: Vec3 = [34, 0, 40];
blocks.push(
  box([CHAPEL[0], 8, CHAPEL[2]], [11, 16, 26], 'sandstone', 'default', { noCollide: true, color: '#b8ac95' }),
);
for (const side of [-1, 1]) {
  blocks.push(
    box([CHAPEL[0] + side * 3.1, 20, CHAPEL[2]], [7.4, 0.5, 26.6], 'sandstone', 'default', {
      noCollide: true,
      rot: [0, 0, side * deg(52)],
      color: '#5c4a40',
    }),
  );
  // Buttresses down the flanks, three a side.
  for (let i = 0; i < 3; i++) {
    blocks.push(
      box([CHAPEL[0] + side * 6, 7, CHAPEL[2] - 8 + i * 8], [1.4, 14, 1.4], 'sandstone', 'default', {
        noCollide: true,
        color: '#a89c86',
      }),
    );
  }
}
blocks.push(
  // Lancet windows down the nave: three tall dark slots, the whole point of a
  // building famous for its stained glass.
  ...[-8, 0, 8].map((dz) =>
    box([CHAPEL[0] - 5.6, 11, CHAPEL[2] + dz], [0.4, 9, 2.4], 'sandstone', 'default', {
      noCollide: true,
      color: '#3a3630',
    }),
  ),
  // The tower and its spire over the west front.
  box([CHAPEL[0], 13, CHAPEL[2] - 16], [7.5, 26, 7.5], 'sandstone', 'default', { noCollide: true, color: '#b8ac95' }),
  box([CHAPEL[0], 29, CHAPEL[2] - 16], [5.2, 8, 5.2], 'sandstone', 'default', { noCollide: true, color: '#a89c86' }),
  box([CHAPEL[0], 37, CHAPEL[2] - 16], [3, 10, 3], 'sandstone', 'default', { noCollide: true, color: '#a89c86' }),
  box([CHAPEL[0], 45, CHAPEL[2] - 16], [1.2, 8, 1.2], 'sandstone', 'default', { noCollide: true, color: '#9c9182' }),
);
blocks.push(...downtownSkyline([-245, -10, 10], 55, 3));

export const cathedralLevel: LevelDef = {
  id: 'cathedral',
  name: 'The Cathedral of Learning',
  place: 'Oakland, forty-two storeys of it',
  hint: 'Every ledge is caught by the setback below it. You lose height, not the run — keep climbing.',
  difficulty: 'advanced',
  // Sixteen more units of climb than the tower used to have, and the spiral is
  // the slow part of the run: both clocks move with it.
  parTime: 112000,
  goldTime: 72000,
  spawn: { pos: [-70, 2, 0], yaw: Math.PI / 2 },
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
