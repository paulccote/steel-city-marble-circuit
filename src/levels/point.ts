import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { arcWalk, box, deg, downtownSkyline, lampRow, pier } from './helpers';

/**
 * Level 2 — Point State Park.
 *
 * One idea: the curve. Everything here is a sustained arc, and the level asks
 * the same question three times with less and less grip to answer it with.
 *
 *   1. The great lawn. A chicane of hedges on grass (friction 1.5). You can
 *      hold a bad line and still make it; the point is to learn that steering
 *      early costs less speed than steering late.
 *   2. The riverwalk. The same curve, out over the Allegheny on piers, on wet
 *      stone (tarmac, 0.35). Half the grip, and one side is a river.
 *   3. The fountain ring. Narrower again, banked 14 degrees, water on the
 *      inside and the confluence on the outside.
 *
 * The mercy is deliberate and asymmetric: fall inward and you land in the
 * fountain basin and wade back up a ramp, losing five seconds. Fall outward
 * and you are in the Ohio.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

const O: Vec3 = [0, 0, 0];
/** Walking level of the whole park. Everything is measured off this. */
const RING_R = 18;
const RING_W = 4.5;
const BASIN_Y = -1;

// ------------------------------------------------------------- the confluence
// One water plane under everything. At the Point the rivers are the ground
// plane, so there is no reason to model three of them.
blocks.push(
  box([20, -2.4, 0], [420, 0.4, 420], 'water', 'water', { noCollide: true, color: '#5c7a86' }),
);

// -------------------------------------------------------------- the great lawn
// A wedge of land widening eastward, which is the actual shape of the park.
// The west edge stops at x = 30, nine units short of the fountain ring, so the
// riverwalk is the only way across rather than an optional detour.
for (let i = 0; i < 5; i++) {
  const cx = 36.5 + i * 13;
  const hw = 14 + i * 2.6;
  blocks.push(box([cx, -0.5, 0], [13, 1, hw * 2], 'grass', 'grass'));
}

// Riverbank parapet, with a gap left open exactly where the riverwalk leaves.
blocks.push(
  box([30, 0.6, -8], [1, 1.2, 26], 'concrete', 'default'),
  box([30, 0.6, 20], [1, 1.2, 16], 'concrete', 'default'),
);

// The chicane: three hedges, right–left–right. 1.8 units tall, which is above
// the 1.4 a flat-ground jump can clear, so they are walls and not ramps.
const hedge = (pos: Vec3, size: Vec3) =>
  box(pos, size, 'grass', 'grass', { color: '#3f5d33' });
blocks.push(
  hedge([68, 0.9, -8], [2.4, 1.8, 20]),
  hedge([56, 0.9, 9], [2.4, 1.8, 18]),
  hedge([46, 0.9, -6], [2.4, 1.8, 16]),
);

blocks.push(...lampRow([72, 0, -20], [-1, 0, 0], 5, 11));
blocks.push(...lampRow([72, 0, 20], [-1, 0, 0], 5, 11));

// The Portal Bridge: the concrete gateway you pass under leaving the lawn. Its
// piers are solid, so it also reads as a gate you must aim through.
blocks.push(
  box([38, 4.5, 0], [3, 9, 3], 'concrete', 'default'),
  box([38, 4.5, 18], [3, 9, 3], 'concrete', 'default'),
  box([38, 9.8, 9], [3.4, 1.6, 21], 'concrete', 'default', { noCollide: true }),
);

entities.push(
  { kind: 'startPad', pos: [78, 0, 0] },
  { kind: 'gem', pos: [72, 0.5, 0] },
  { kind: 'gem', pos: [68, 0.5, 8] },
  { kind: 'gem', pos: [56, 0.5, -7] },
  { kind: 'gem', pos: [46, 0.5, 8] },
);

// ------------------------------------------------------------- the riverwalk
// Two arcs that reverse into each other. The centres were picked so the second
// arc is internally tangent to the fountain ring: it ends exactly on the ring
// at 110 degrees, heading the way the ring runs, with no seam to catch on.
const WALK_A: Vec3 = [33.03, 0, 38.59]; // radius 30, carries you off the lawn
const WALK_B: Vec3 = [2.05, 0, -5.64]; // radius 24, tangent to the ring at 110°

blocks.push(
  ...arcWalk(WALK_A, 30, 6, deg(235), deg(50), {
    texture: 'cobblestone',
    surface: 'cobblestone',
    thickness: 0.7,
  }),
  // Wet from the fountain spray: a third of the grip, and the reversal in the
  // curve arrives right as the surface changes.
  ...arcWalk(WALK_B, 24, 6, deg(55), deg(55), {
    texture: 'concrete',
    surface: 'tarmac',
    thickness: 0.7,
    outerWall: 0.4,
  }),
);

// Piers, so the walk reads as built over water rather than floating on it.
for (const [cx, cz] of [
  [30.4, 8.7],
  [25.3, 9.6],
  [19.6, 12.0],
  [12.4, 16.0],
  [4.0, 18.6],
  [-3.5, 17.9],
]) {
  blocks.push(...pier([cx, -0.7, cz], 9, 0.6));
}

entities.push(
  { kind: 'gem', pos: [33.03, 0.55, 8.59] },
  { kind: 'gem', pos: [21.8, 0.55, 10.77] },
  { kind: 'gem', pos: [10.26, 0.55, 16.92] },
  { kind: 'gem', pos: [-0.04, 0.55, 18.27] },
);

// ---------------------------------------------------------------- the fountain

// The basin. A real floor, not a pit: landing in it is a five-second wade, and
// that asymmetry is what makes the outer edge frightening by comparison.
blocks.push(
  { kind: 'cylinder', pos: [0, BASIN_Y - 0.3, 0], radius: 16, height: 0.6, segments: 40,
    texture: 'water', surface: 'water', color: '#7fa3ad' },
);

// The walking ring. Banked 14 degrees over the half that matters — the western
// sweep out over the confluence — and flat on the way back round.
blocks.push(
  ...arcWalk(O, RING_R, RING_W, deg(110), deg(180), {
    texture: 'concrete',
    surface: 'tarmac',
    thickness: 0.8,
    bank: deg(14),
    outerWall: 0.55,
  }),
  ...arcWalk(O, RING_R, RING_W, deg(290), deg(180), {
    texture: 'concrete',
    surface: 'tarmac',
    thickness: 0.8,
    outerWall: 0.55,
  }),
);

// Two ramps between the ring and the basin, one unit of drop over six units of
// run. The one at 290° is the route; the one at 110° is the way back up if you
// fell in, and without it a player in the basin could never finish.
const basinRamp = (angle: number): Block => {
  const a = deg(angle);
  // A ramp is high at its -X end. Yaw of (pi - a) sends local +X straight at
  // the fountain's centre, so the slope always falls inward.
  const yaw = Math.PI - a;
  return {
    kind: 'ramp',
    pos: [Math.cos(a) * 12.75, -0.5, Math.sin(a) * 12.75],
    size: [6, 1, 5],
    rot: [0, yaw, 0],
    texture: 'concrete',
    surface: 'default',
  };
};
blocks.push(basinRamp(290), basinRamp(110));

entities.push(
  { kind: 'gem', pos: [RING_R * Math.cos(deg(135)), 0.6, RING_R * Math.sin(deg(135))] },
  { kind: 'gem', pos: [RING_R * Math.cos(deg(165)), 0.6, RING_R * Math.sin(deg(165))] },
  { kind: 'gem', pos: [RING_R * Math.cos(deg(195)), 0.6, RING_R * Math.sin(deg(195))] },
  { kind: 'gem', pos: [RING_R * Math.cos(deg(225)), 0.6, RING_R * Math.sin(deg(225))] },
  { kind: 'gem', pos: [RING_R * Math.cos(deg(260)), 0.6, RING_R * Math.sin(deg(260))] },
);

// ------------------------------------------------------- the fountain plinth
// A helix around the jet: 3.4 up over 29 units of arc, under seven degrees.
// After the ring it is meant to be a victory lap, not another test.
blocks.push(
  // No kerb on this one. A kerb at its foot would be a 0.35 lip standing
  // between the basin ramp and the helix, and a 0.2-radius marble cannot climb
  // 0.35 — it would seal the only way out of the fountain.
  ...arcWalk([0, BASIN_Y, 0], 6.5, 3, deg(285), deg(255), {
    rise: 3.4,
    thickness: 0.5,
    texture: 'concrete',
    surface: 'default',
  }),
  { kind: 'cylinder', pos: [0, 0.7, 0], radius: 4, height: 3.4, segments: 28,
    texture: 'sandstone', surface: 'default' },
  box([-4.4, 2.25, 0], [5.2, 0.3, 3.4], 'sandstone', 'default'),
);

// The jets. Purely visual — a fan strong enough to read as a fountain would
// also be strong enough to throw the marble off the plinth at the finish.
for (let i = 0; i < 8; i++) {
  const a = deg(i * 45 + 22);
  blocks.push({
    kind: 'cylinder',
    pos: [Math.cos(a) * 11, BASIN_Y + 2.2, Math.sin(a) * 11],
    radius: 0.16,
    height: 4.4,
    segments: 6,
    texture: 'water',
    surface: 'water',
    noCollide: true,
    color: '#cfe6ee',
  });
}

entities.push(
  { kind: 'gem', pos: [3.25, -0.4, -8.93] },
  { kind: 'gem', pos: [3.96, 1.2, 5.16] },
  { kind: 'endPad', pos: [0, 2.4, 0] },
);

// ------------------------------------------------------------- distant scenery
// Downtown sits east, behind the start, so the marble runs away from the city
// and out into the rivers.
blocks.push(...downtownSkyline([150, -6, 10], 95, 11));

export const pointLevel: LevelDef = {
  id: 'point',
  name: 'The Point',
  place: 'Point State Park, at the confluence',
  hint: 'Steer early. Wet stone will not fix a late line, and the ring is banked for a reason.',
  difficulty: 'intermediate',
  parTime: 60000,
  goldTime: 34000,
  spawn: { pos: [78, 0.5, 0], yaw: -Math.PI / 2 },
  killY: -6,
  sky: {
    top: '#2f5f9e',
    bottom: '#f4c07c',
    fog: '#e3b189',
    fogNear: 60,
    fogFar: 320,
    sunDir: [-0.88, 0.26, 0.12],
    sunColor: '#ffd6a0',
    ambient: '#5f6a80',
    skyline: 'downtown',
  },
  blocks,
  entities,
};
