import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { arcWalk, box, deg, downtownSkyline, lampRow, pier, portalGate, stairFlight } from './helpers';

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
// Deliberately darker than the fountain basin, which is the other water in this
// level and the only water in it you are allowed to stand in. Two sheets of
// water a unit apart, one a five-second wade and one the end of the run, cannot
// be the same colour.
blocks.push(
  box([20, -2.4, 0], [420, 0.4, 420], 'water', 'water', { noCollide: true, color: '#2f4a56' }),
);

// -------------------------------------------------------------- the great lawn
// A wedge of land widening eastward, which is the actual shape of the park.
// The west edge stops at x = 30, nine units short of the fountain ring, so the
// riverwalk is the only way across rather than an optional detour.
for (let i = 0; i < 6; i++) {
  const cx = 36.5 + i * 13;
  const hw = 14 + i * 2.6;
  blocks.push(box([cx, -0.5, 0], [13, 1, hw * 2], 'grass', 'grass'));
}

// Riverbank parapet, with a gap left open exactly where the riverwalk leaves.
blocks.push(
  box([30, 0.6, -8], [1, 1.2, 26], 'concrete', 'default'),
  box([30, 0.6, 20], [1, 1.2, 16], 'concrete', 'default'),
);

// ------------------------------------------------- Commonwealth Place terrace
// The lawn used to open on forty units of unbroken grass. It now starts three
// units up on a paved terrace and steps down onto the park, so the first thing
// the player sees is the course falling away from them rather than a plane.
const TERRACE_Y = 3;
blocks.push(
  box([84, TERRACE_Y - 0.5, 0], [22, 1, 30], 'cobblestone', 'cobblestone'),
  box([95.5, TERRACE_Y + 0.9, 0], [1, 2.8, 30], 'concrete', 'default'),
  box([84, TERRACE_Y + 0.9, -15.5], [22, 2.8, 1], 'concrete', 'default'),
  box([84, TERRACE_Y + 0.9, 15.5], [22, 2.8, 1], 'concrete', 'default'),
);
// The flight has to sit *outside* the terrace slab. Built inside its footprint
// it is buried under it, and the terrace edge becomes a three-unit blind drop
// onto the lawn instead of a set of steps.
blocks.push(...stairFlight([67, 0, 0], [73, TERRACE_Y, 0], 12, 7, 'concrete', 'cobblestone'));

// The park gate. Twelve units ahead of the pad, which at this camera pitch is
// close enough that the pylons run off the top of the frame and read as mass.
blocks.push(
  ...portalGate([68, 0, 0], 9, 5.2, {
    texture: 'sandstone',
    surface: 'default',
    color: '#bdb29a',
    thickness: 1.9,
    beam: 1.4,
  }),
);

// -------------------------------------------------------------- the great walk
// A paved allee down the axis of the lawn, raised a tenth of a unit so it does
// not fight the grass it sits on, with a kerb either side. The kerbs are the
// point: two lines running to the vanishing point tell the eye how fast it is
// moving in a way an unbroken field never will.
blocks.push(box([50, -0.05, 0], [46, 0.3, 15], 'cobblestone', 'cobblestone'));
// Non-colliding: the chicane deliberately throws the racing line eight units
// off axis, and a solid kerb would be a fence across it.
for (const z of [-7.3, 7.3]) {
  blocks.push(box([50, 0.22, z], [46, 0.34, 0.7], 'concrete', 'default', { noCollide: true, color: '#b9b3a4' }));
}

// Planes and lamps along the kerb. Trunks collide, canopies do not, and both
// sit four units off the racing line where they will actually sweep past.
for (let i = 0; i < 6; i++) {
  const x = 68 - i * 7.5;
  for (const z of [-10.5, 10.5]) {
    blocks.push(
      { kind: 'cylinder', pos: [x, 2.1, z], radius: 0.55, height: 4.2, segments: 8,
        texture: 'wood', surface: 'default' },
      { kind: 'cylinder', pos: [x, 5.9, z], radius: 3.5, height: 5, segments: 10,
        texture: 'grass', surface: 'grass', noCollide: true, color: '#3c5f33' },
    );
  }
}

blocks.push(...lampRow([66, 0, -8.4], [-1, 0, 0], 5, 9));
blocks.push(...lampRow([66, 0, 8.4], [-1, 0, 0], 5, 9));

// The Portal Bridge: the concrete gateway you pass under leaving the lawn. Its
// piers are solid, so it also reads as a gate you must aim through.
blocks.push(
  box([38, 4.5, 0], [3, 9, 3], 'concrete', 'default'),
  box([38, 4.5, 18], [3, 9, 3], 'concrete', 'default'),
  box([38, 9.8, 9], [3.4, 1.6, 21], 'concrete', 'default', { noCollide: true }),
);

entities.push(
  { kind: 'startPad', pos: [86, TERRACE_Y, 0] },
  { kind: 'gem', pos: [79, TERRACE_Y + 0.5, 0] },
  { kind: 'gem', pos: [60, 0.6, 8] },
  { kind: 'gem', pos: [50, 0.6, -7] },
  { kind: 'gem', pos: [40, 0.6, 8] },
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
    // Railings both sides. This walk is a 0.7-thick slab two units above a
    // river, on piers, and from a marble's eye the slab's own edge and the
    // water beyond it land on the same line: without these the only thing
    // separating the path from the drop is a change of texture. The second arc
    // already had its outer rail; this one had neither.
    outerWall: 0.4,
    innerWall: 0.4,
  }),
  // Wet from the fountain spray: a third of the grip, and the reversal in the
  // curve arrives right as the surface changes.
  ...arcWalk(WALK_B, 24, 6, deg(55), deg(55), {
    texture: 'concrete',
    surface: 'tarmac',
    thickness: 0.7,
    outerWall: 0.4,
    // The inner rail ends where the sweep does, which is the tangent point at
    // 110 degrees. Three units in from the tangent it stands at radius 15 from
    // the fountain — inside the ring's own inner edge, so it marks the drop
    // without standing in the mouth of the ring.
    innerWall: 0.4,
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
// that asymmetry is what makes the outer edge frightening by comparison. It
// only works if the player can see which of the two is which, and it used to be
// built out of the same water plane as the river with the same texture and
// nearly the same colour, a unit apart. So the floor of the basin is now what a
// fountain floor actually is — pale tile, dry-looking, plainly a made thing —
// and the water in it is a separate skin laid over the top, thin enough to read
// as ankle-deep.
blocks.push(
  { kind: 'cylinder', pos: [0, BASIN_Y - 0.3, 0], radius: 16, height: 0.6, segments: 40,
    texture: 'sandstone', surface: 'water', color: '#b9c9c4' },
  // The basin floor's top face is at -1, so the skin sits from there up: a
  // twelve-hundredths-of-a-unit film, which is what ankle-deep looks like
  // against a marble 0.4 across.
  { kind: 'cylinder', pos: [0, BASIN_Y + 0.06, 0], radius: 15.4, height: 0.12, segments: 40,
    texture: 'water', surface: 'water', noCollide: true, color: '#8fc4cf' },
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

// Four jets off the plinth, tall enough to clear the horizon line from the far
// end of the lawn. They are the only thing that marks the finish from the start.
for (let i = 0; i < 4; i++) {
  const a = deg(45 + i * 90);
  blocks.push({
    kind: 'cylinder',
    pos: [Math.cos(a) * 2.6, 14, Math.sin(a) * 2.6],
    radius: 0.5,
    height: 24,
    segments: 6,
    texture: 'water',
    surface: 'water',
    noCollide: true,
    color: '#d8ecf3',
  });
}

entities.push(
  { kind: 'checkpoint', pos: [-6.16, 0, 16.92] },
  { kind: 'gem', pos: [3.25, -0.4, -8.93] },
  { kind: 'gem', pos: [3.96, 1.2, 5.16] },
  { kind: 'endPad', pos: [0, 2.4, 0] },
);

// ------------------------------------------------------------- distant scenery
// Downtown sits east, behind the start, so the marble runs away from the city
// and out into the rivers.
blocks.push(...downtownSkyline([230, -6, 10], 55, 11));

export const pointLevel: LevelDef = {
  id: 'point',
  name: 'The Point',
  place: 'Point State Park, at the confluence',
  hint: 'Steer early. Wet stone will not fix a late line, and the ring is banked for a reason.',
  difficulty: 'intermediate',
  parTime: 60000,
  goldTime: 34000,
  spawn: { pos: [86, TERRACE_Y + 0.5, 0], yaw: -Math.PI / 2 },
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
