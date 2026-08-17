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

/**
 * Trim for every ledge rim on the tower. Paint, never a lip: this level is
 * forty units of deliberate exposure and a kerb would quietly delete it. The
 * job is to make the edge visible, not to make it safe.
 */
const LEDGE_TRIM = { solid: false, bandColor: '#4b4034' } as const;

/** Ledge widths per run: the spiral narrows as the exposure grows. */
const RUN_W = [3.5, 3.5, 2.8, 2.8, 2.2, 2.2];
const RUN_RISE = 4;

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
  // No gem on the last stone: by then the spiral has wound in to a radius of
  // 1.4 and the mast's 4.4-square cap covers it, so that gem was inside solid
  // stone. The finish gem on top of the mast is two thirds of a unit above it
  // and does the same job.
  if (i % 2 === 0 && i < 6) {
    entities.push({ kind: 'gem', pos: [Math.cos(ang) * r, y + 0.55, Math.sin(ang) * r] });
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
blocks.push(...downtownSkyline([-245, -10, 10], 55, 3));

export const cathedralLevel: LevelDef = {
  id: 'cathedral',
  name: 'The Cathedral of Learning',
  place: 'Oakland, forty-two storeys of it',
  hint: 'Every ledge is caught by the setback below it. You lose height, not the run — keep climbing.',
  difficulty: 'advanced',
  parTime: 82000,
  goldTime: 52000,
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
