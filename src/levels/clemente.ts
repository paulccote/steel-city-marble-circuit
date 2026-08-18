import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, downtownSkyline, dropLip, gemLine, kerb, lampRow, portalGate, slopeDeck } from './helpers';

/**
 * Level 3 — The Roberto Clemente Bridge.
 *
 * One idea: the gap. A flat jump leaves at 7.5 m/s, hangs for 0.75 s, and a
 * marble rolling near its 15 m/s ceiling therefore covers a little over 11
 * units. Every gap in this level is measured against that one number, and the
 * level spends its whole length walking the player up to it.
 *
 *   1. Two holes in the roadway: 4.5 and 6 units. Wide margins, flat landings,
 *      and a gem hung at the top of the arc to teach where the arc goes.
 *   2. The main span with its deck panels gone. Six suspender platforms with
 *      gaps stepping 4.5 → 5 → 5.5 → 6 → 6.5 → 7, so the margin shrinks by
 *      half a unit at a time and never by more.
 *   3. Fourteen units to the north abutment. That is past the ceiling on
 *      purpose: a super jump sits on the racing line, and the abutment is 26
 *      units deep so spending it early or late both land.
 *
 * Then the bridge does what it does in life and puts you down at PNC Park.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

const DECK_Z = 9;
const GOLD = '#d6a638'; // the Sisters' Aztec gold
const CHAIN_Z = 4.9;
const TOWER_S = -16;
const TOWER_N = 112;

/**
 * Deck panel: yellow steel roadway, kerbed so the edge is felt before it is
 * seen. x0 must be the south end. A panel built the other way round is a box
 * with a negative length, which three.js turns inside out: the roadway keeps
 * its collision and loses its top face, and the player rolls along forty units
 * of bridge looking straight through it at the Allegheny. That is exactly how
 * this level came to read as open water, so the order is asserted here.
 */
const deckPanel = (x0: number, x1: number): Block[] => {
  if (x1 <= x0) throw new Error(`deckPanel: ${x0} is not south of ${x1}`);
  return [
    box([(x0 + x1) / 2, -0.3, 0], [x1 - x0, 0.6, DECK_Z], 'steelPainted', 'steel', { color: GOLD }),
    ...kerb([x0, 0, -DECK_Z / 2 + 0.15], [x1, 0, -DECK_Z / 2 + 0.15], { color: '#4a5058' }),
    ...kerb([x0, 0, DECK_Z / 2 - 0.15], [x1, 0, DECK_Z / 2 - 0.15], { color: '#4a5058' }),
  ];
};

// -------------------------------------------------------------- the Allegheny
// Fourteen units down. A flat plane that big has no near edge and no far edge —
// it converges on the horizon at exactly the height the deck does — so from a
// marble's eye it is not obviously below anything at all. Everything in this
// section exists to answer the one question the plane cannot: how far down.
blocks.push(
  // Darker than anything the player can stand on, which is the one rule that
  // makes a river read as a river from a marble's eye height.
  box([80, -14.2, 0], [500, 0.4, 400], 'water', 'water', { noCollide: true, color: '#2c414c' }),
);

/** Masonry down to the water. The cheapest possible statement of "fourteen". */
const riverPier = (x: number, z: number, w: number, d: number): Block[] => [
  box([x, -7.4, z], [w, 13.6, d], 'sandstone', 'default', { noCollide: true, color: '#7d766a' }),
  // A coping course at the waterline: the pier has to *meet* the river
  // somewhere, and that meeting is what fixes the water's depth for the eye.
  box([x, -13.4, z], [w + 1.2, 1.2, d + 1.2], 'sandstone', 'default', {
    noCollide: true,
    color: '#6a6459',
  }),
];

// --------------------------------------------------- south abutment, downtown
// The downtown end sits up on the bluff and ramps down onto the deck, which is
// what it does in life and what gives the opening frame a shape: the player
// starts three units above the bridge and watches the deck fall away toward
// the tower instead of staring at a flat plane.
const PLAZA_Y = 3;
blocks.push(
  box([-43, PLAZA_Y - 0.5, 0], [22, 1, 24], 'cobblestone', 'cobblestone'),
  box([-53.5, PLAZA_Y + 0.6, 0], [1, 2.2, 24], 'concrete', 'default'),
  box([-43, PLAZA_Y + 0.6, -12], [22, 2.2, 1], 'concrete', 'default'),
  box([-43, PLAZA_Y + 0.6, 12], [22, 2.2, 1], 'concrete', 'default'),
  // The ramp down onto the bridge: three units over eight, about 21 degrees.
  slopeDeck([-32, PLAZA_Y, 0], [-26, 0, 0], 9, 0.8, 'cobblestone', 'cobblestone'),
  // A kerb line and a banding course across the plaza. An unbroken paved
  // expanse is the specific thing that reads as wallpaper; two lines across it
  // do not. Both non-colliding: a 0.3 lip across the racing line stopped a
  // marble at full roll dead when it was solid.
  box([-38, PLAZA_Y + 0.08, 0], [0.5, 0.3, 24], 'concrete', 'default', { noCollide: true, color: '#9aa0a6' }),
  box([-32.4, PLAZA_Y + 0.05, 0], [1.4, 0.2, 24], 'concrete', 'default', { noCollide: true, color: '#9aa0a6' }),
);

// The chain anchorages. Self-anchored or not, the eyebars have to land in
// something, and two five-unit blocks either side of the start pad are the
// cheapest way to put mass in the frame's outer thirds.
// Seven and a half units off the centreline and ten ahead of the pad, which is
// as close as they can come before they stop framing the bridge and start
// hiding it.
for (const z of [-8.5, 8.5]) {
  blocks.push(
    box([-31, PLAZA_Y + 1.8, z], [7, 3.6, 3.4], 'sandstone', 'default', { color: '#a89e8c' }),
    box([-31, PLAZA_Y + 3.85, z], [7.8, 0.5, 4], 'sandstone', 'default', {
      noCollide: true,
      color: '#8f8778',
    }),
  );
}

// Bollards down both sides of the walking line. They live in the near field,
// which is the part of the frame the camera's downward pitch fills with floor
// no matter what is on the horizon — the only cure for it is something close.
for (let i = 0; i < 4; i++) {
  for (const z of [-5.2, 5.2]) {
    blocks.push(
      { kind: 'cylinder', pos: [-37 + i * 4.6, PLAZA_Y + 0.45, z], radius: 0.26, height: 0.9,
        segments: 8, texture: 'steel', surface: 'steel', color: '#6c7480' },
    );
  }
}

// The wharf. The plaza has to stop somewhere and the river has to start
// somewhere, and until this was here they were the same line: seventeen units
// of drop with nothing drawn on it. It is split either side of the ramp mouth,
// which is the one place the land does come down to meet the bridge.
for (const [z0, z1] of [[-34, -5], [5, 34]] as const) {
  blocks.push(
    box([-31.6, -5.6, (z0 + z1) / 2], [3.2, 17.6, z1 - z0], 'sandstone', 'default', {
      noCollide: true,
      color: '#7d766a',
    }),
    // Coping along the top, a shade lighter, so the bank reads as an edge and
    // not as a cliff-coloured smear against the water. Barely proud of the
    // plaza: it is non-colliding, and a non-colliding course standing half a
    // unit up would look exactly like the kerb below and behave nothing like it.
    box([-31.6, PLAZA_Y - 0.03, (z0 + z1) / 2], [4, 0.2, z1 - z0], 'sandstone', 'default', {
      noCollide: true,
      color: '#a49a88',
    }),
  );
}
// The plaza's own east edge, either side of the ramp mouth. Seventeen units
// down to the Allegheny, three metres from the start pad, and the one edge of
// the four this square has that had nothing on it.
for (const [z0, z1] of [[-12, -4.6], [4.6, 12]] as const) {
  blocks.push(...kerb([-32.15, PLAZA_Y, z0], [-32.15, PLAZA_Y, z1], { height: 0.5, color: '#9a9084' }));
}

blocks.push(...lampRow([-50, PLAZA_Y, -10.4], [1, 0, 0], 3, 7));
blocks.push(...lampRow([-50, PLAZA_Y, 10.4], [1, 0, 0], 3, 7));

entities.push({ kind: 'startPad', pos: [-40, PLAZA_Y, 0] });

// --------------------------------------------- beat 1: two holes in the deck
// Thirty units of run-up, about twice the distance it takes to reach the
// rolling ceiling, so the first gap is met at full pace however the player
// drives up to it.
blocks.push(...deckPanel(-26, 2));
blocks.push(...deckPanel(6.5, 20));
// 26 to 40, not 26 to the south tower: the tower is at -16, behind the player,
// so that panel was built backwards and swallowed both holes. Forty is where
// the suspender run starts, and every gem and checkpoint in this stretch was
// already measured against it.
blocks.push(...deckPanel(26, 40));

// The two holes are the level's first ask, so they are marked as such: paint
// across the last unit of deck and a chevron board either side of the lane.
blocks.push(...dropLip([2, 0, 0], DECK_Z - 2.4), ...dropLip([20, 0, 0], DECK_Z - 2.4));

entities.push(
  ...gemLine([-20, 0.5, 0], [-4, 0.5, 0], 2),
  // Hung in the arc of the jump rather than beside it.
  { kind: 'gem', pos: [4.25, 1.2, 0] },
  { kind: 'gem', pos: [13, 0.5, 0] },
  { kind: 'gem', pos: [23, 1.2, 0] },
  { kind: 'gem', pos: [33, 0.5, 0] },
);

// ------------------------------------------------------------------ the towers
/**
 * A tower. The Sisters' towers are not columns with a bar across the top: they
 * are riveted steel boxes that step in twice as they rise, carry a lattice
 * portal between them, and finish in a pinnacle with a saddle under it. That
 * profile is what tells a stranger at a glance that this is one of three
 * identical 1920s eyebar bridges rather than a generic suspension bridge, so it
 * is worth the fifteen extra boxes a side.
 */
const tower = (x: number): Block[] => {
  const out: Block[] = [];
  for (const z of [-CHAIN_Z, CHAIN_Z]) {
    // Shaft, then two setbacks, then the pinnacle and the cable saddle.
    out.push(
      box([x, 5, z], [3, 22, 3], 'steelPainted', 'steel', { color: GOLD }),
      box([x, 16.6, z], [3.6, 1.2, 3.6], 'steelPainted', 'steel', { color: '#b5892c', noCollide: true }),
      box([x, 18.6, z], [2.6, 3, 2.6], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
      box([x, 20.4, z], [3, 0.7, 3], 'steelPainted', 'steel', { color: '#b5892c', noCollide: true }),
      box([x, 22.2, z], [1.9, 3, 1.9], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
      box([x, 24.4, z], [1.1, 1.6, 1.1], 'steelPainted', 'steel', { color: '#b5892c', noCollide: true }),
      // The saddle the chain actually passes over, at the top of the shaft.
      box([x, 16.2, z], [2.2, 1.1, 4.4], 'steel', 'steel', { color: '#8d7a4c', noCollide: true }),
    );
    // Riveted panel lines up the shaft, so a 22-unit column is not one flat
    // face from the deck.
    for (let i = 0; i < 4; i++) {
      out.push(
        box([x, -3 + i * 5.4, z], [3.3, 0.4, 3.3], 'steelPainted', 'steel', {
          color: '#b5892c',
          noCollide: true,
        }),
      );
    }
  }
  // The portal between the two legs: a top strut, a lower strut, and a lattice
  // of diagonals in the frame between them.
  out.push(
    box([x, 16.6, 0], [3, 1.2, 13], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
    box([x, 12.6, 0], [2.4, 0.8, 13], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
    box([x, 9, 0], [2.2, 0.9, 13], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
  );
  for (let i = 0; i < 4; i++) {
    const zc = -CHAIN_Z + 2.45 + i * 2.45;
    const diag = Math.hypot(2.45, 3.6);
    for (const s of [1, -1]) {
      out.push(
        box([x, 14.6, zc - 1.225], [0.45, 0.45, diag], 'steelPainted', 'steel', {
          rot: [s * Math.atan2(3.6, 2.45), 0, 0],
          color: GOLD,
          noCollide: true,
        }),
      );
    }
  }
  return out;
};
blocks.push(...tower(TOWER_S), ...tower(TOWER_N));
// Each tower stands on a pier, because a tower that stops at the deck is a
// tower floating on the same nothing the deck is floating on.
blocks.push(...riverPier(TOWER_S, 0, 6, 13), ...riverPier(TOWER_N, 0, 6, 13));
// One approach bent between the wharf and the south tower.
blocks.push(...riverPier(-24, 0, 3.4, 10));

// The eyebar chain: a parabola saddle to saddle, sagging to just above deck
// level at midspan. That profile is what makes a self-anchored suspension
// bridge readable from a mile off, and it is the only reason to look up.
const SAG_X = (TOWER_S + TOWER_N) / 2;
const HALF_SPAN = (TOWER_N - TOWER_S) / 2;
const CHAIN_K = 15 / (HALF_SPAN * HALF_SPAN);
const chainY = (x: number) => 1 + CHAIN_K * (x - SAG_X) ** 2;

for (const z of [-CHAIN_Z, CHAIN_Z]) {
  // Three-unit links, not two. A shallow parabola over a 128-unit span is not
  // measurably smoother at 64 chords than at 43, and the three blocks a link
  // costs add up faster than the curve improves.
  const LINK = 3;
  for (let i = 0; i * LINK < TOWER_N - TOWER_S; i++) {
    const x0 = TOWER_S + i * LINK;
    const y0 = chainY(x0);
    const y1 = chainY(x0 + LINK);
    blocks.push(
      // Two flat bars side by side rather than one round cable. An eyebar chain
      // is exactly that — pairs of forged flats — and the doubling is half of
      // why the Sisters look the way they do from the deck.
      box([x0 + LINK / 2, (y0 + y1) / 2, z - 0.28], [Math.hypot(LINK, y1 - y0), 0.5, 0.16], 'steelPainted', 'steel', {
        rot: [0, 0, Math.atan2(y1 - y0, LINK)],
        color: GOLD,
        noCollide: true,
      }),
      box([x0 + LINK / 2, (y0 + y1) / 2, z + 0.28], [Math.hypot(LINK, y1 - y0), 0.5, 0.16], 'steelPainted', 'steel', {
        rot: [0, 0, Math.atan2(y1 - y0, LINK)],
        color: GOLD,
        noCollide: true,
      }),
      // The pin plate at the joint. This is the other half: a chain is made of
      // straight links with a visible bolted eye between each pair, and without
      // the eye a run of chords is just a faceted cable.
      box([x0, y0, z], [0.95, 0.95, 0.95], 'steel', 'steel', {
        color: '#a8873c',
        noCollide: true,
      }),
    );
  }
  // Side spans, anchored back down into the abutments.
  for (const [ax, bx, y0, y1] of [[-41, TOWER_S, 6.5, 16], [TOWER_N, 176, 16, 3.5]] as const) {
    blocks.push(
      box([(ax + bx) / 2, (y0 + y1) / 2, z], [Math.hypot(bx - ax, y1 - y0), 0.36, 0.36], 'steelPainted', 'steel', {
        rot: [0, 0, Math.atan2(y1 - y0, bx - ax)],
        color: GOLD,
        noCollide: true,
      }),
    );
  }
}

// Suspender rods down the approach, every six units at both chain lines. They
// are the whole reason this opening frame is not a paved plane: nineteen
// verticals four and a half units off the racing line, each one sweeping past
// the camera, is what a bridge feels like from a marble's eye height.
for (let x = -10; x <= 38; x += 6) {
  const top = chainY(x);
  for (const z of [-CHAIN_Z, CHAIN_Z]) {
    blocks.push({
      kind: 'cylinder',
      pos: [x, top / 2, z],
      radius: 0.11,
      height: top,
      segments: 6,
      texture: 'steelPainted',
      surface: 'steel',
      noCollide: true,
      color: GOLD,
    });
  }
  // A collar where each rod meets the deck, so the rank has a base line. Only
  // where there is a deck for it to be bolted to: the two holes are the point
  // of this stretch and a steel bar lying across one is a promise of floor.
  const overHole = (2 - 0.4 < x && x < 6.5 + 0.4) || (20 - 0.4 < x && x < 26 + 0.4);
  if (!overHole) {
    // 0.1 tall and no wider than the roadway. At 0.24 it stood as high as a
    // kerb and ran out past the deck edge, so from a marble's eye every six
    // units of bridge had what looked like a step across it and was not.
    blocks.push(
      box([x, 0.05, 0], [0.3, 0.1, DECK_Z - 0.6], 'steel', 'steel', {
        noCollide: true,
        color: '#6b7078',
      }),
    );
  }
}

// The portal through the south tower: the frame you roll under to get onto the
// bridge, and the thing that says "suspension bridge" before anything else.
blocks.push(
  // The beam sits at 3.6 rather than up at the tower's waist. Anything higher
  // than about four units leaves the frame at this range, and a portal you
  // cannot see is not a portal.
  ...portalGate([TOWER_S, 0, 0], 4.35, 3.6, {
    texture: 'steelPainted',
    surface: 'steel',
    color: GOLD,
    thickness: 1.1,
    beam: 1.2,
    solid: false,
  }),
);

// ------------------------------------------ beat 2: the suspender platforms
// 5.5 units of platform, and grit-blasted rather than bare steel. Restitution
// matters more than length here: a steel landing bounces the marble 2.2 m/s
// back into the air and it cannot jump again until it settles, so the panels
// use stone's restitution and the marble is steerable again within two units.
const GAPS = [4.5, 5, 5.5, 6, 6.5, 7];
const PLAT = 5.5;
// The run starts at the end of the last deck panel. It used to start at the
// south tower, 56 units back, which stacked the first three platforms on top of
// the roadway and left sixty units of open river before the north tower.
let edge = 40;
for (const gap of GAPS) {
  const x0 = edge + gap;
  const cx = x0 + PLAT / 2;
  blocks.push(
    box([cx, -0.3, 0], [PLAT, 0.6, 5], 'steelPainted', 'cobblestone', { color: GOLD }),
    // Cross-beam under the panel, carrying the hanger rods up to the chain.
    box([cx, -0.75, 0], [0.5, 0.3, 10.4], 'steel', 'steel', { noCollide: true }),
    // Kerbs down the long sides only. A platform you land on and jump off
    // cannot have a lip across either end, but the sides are exactly where a
    // marble that lands crooked leaves — and over open water a 5-unit panel
    // with no rim is the hardest thing in the game to judge.
    ...kerb([x0, 0, -2.35], [x0 + PLAT, 0, -2.35], { color: '#4a5058' }),
    ...kerb([x0, 0, 2.35], [x0 + PLAT, 0, 2.35], { color: '#4a5058' }),
  );
  for (const z of [-CHAIN_Z, CHAIN_Z]) {
    const top = chainY(cx);
    blocks.push({
      kind: 'cylinder',
      pos: [cx, top / 2, z],
      radius: 0.08,
      height: top,
      segments: 6,
      texture: 'steel',
      surface: 'steel',
      noCollide: true,
    });
  }
  entities.push({ kind: 'gem', pos: [cx, 0.55, 0] });
  edge = x0 + PLAT;
}
// edge lands at 107.5; the north tower stands 4.5 further on.

// --------------------------------------------- beat 3: the fourteen-unit gap
blocks.push(...deckPanel(TOWER_N, 130));
entities.push({ kind: 'powerup', type: 'superJump', pos: [125, 0.9, 0] });
// Two checkpoints. Missing a suspender platform or the fourteen-unit gap used
// to cost the whole bridge; now it costs the section you were in, which is the
// right size of penalty for a mistake this readable.
entities.push(
  { kind: 'checkpoint', pos: [32, 0, 0] },
  { kind: 'checkpoint', pos: [116, 0, 0] },
);

// Chevron boards at the lip. Nothing about this gap looks different from the
// last six, so the level says out loud that it is, and says it from far enough
// back to act on. Non-colliding: a warning, not a wall. These are the tall
// pair — 2.4 rather than the standard 1.6 — because this is the one gap in the
// level a player is expected to arrive at already carrying a powerup.
blocks.push(...dropLip([130, 0, 0], 6.6, { boards: false }));
for (const z of [-4.2, 4.2]) {
  blocks.push(
    box([129.4, 1.5, z], [0.4, 2.4, 1.8], 'steelPainted', 'default', {
      color: '#efd23c',
      noCollide: true,
    }),
  );
}

// North abutment, 26 units deep — a super jump spent a beat early or a beat
// late has to land somewhere sensible either way.
blocks.push(
  box([157, -0.3, 0], [26, 0.6, 20], 'concrete', 'default'),
  box([157, 0.7, -10.2], [26, 2, 0.6], 'concrete', 'default'),
  box([157, 0.7, 10.2], [26, 2, 0.6], 'concrete', 'default'),
  // The north bank: the abutment and the ballpark behind it are the far side of
  // the river, so the ground under them has to come up out of it.
  ...riverPier(157, 0, 26, 20),
  ...riverPier(190, 0, 46, 56),
);
// A chevron facing back the way you came, on the abutment's lip. It is the
// landing for the fourteen-unit gap, and from the far side of that gap the only
// thing that tells you where the concrete starts is its own edge.
blocks.push(...dropLip([144.4, 0, 0], 18, { yaw: Math.PI, boards: false }));

// -------------------------------------------------------------------- PNC Park
// The bridge lands at the home-plate gate, which is where it lands in life.
// The last three gems run second, third, home.
blocks.push(
  box([190, -0.5, 0], [46, 1, 56], 'grass', 'grass', { color: '#4a7a3c' }),
  box([195, 0.03, 0], [19, 0.06, 19], 'sandstone', 'default', {
    rot: [0, Math.PI / 4, 0],
    noCollide: true,
    color: '#a8785a',
  }),
);
for (const [bx, bz] of [[204, 0], [195, -9], [186, 0], [195, 9]] as const) {
  blocks.push(
    box([bx, 0.09, bz], [1.1, 0.12, 1.1], 'concrete', 'default', { noCollide: true, color: '#f2f0e8' }),
  );
}
blocks.push(
  box([213, 4, 0], [1, 8, 56], 'steelPainted', 'default', { color: '#1c2b46' }),
  box([190, 4, 28], [46, 8, 1], 'steelPainted', 'default', { color: '#1c2b46' }),
  box([190, 4, -28], [46, 8, 1], 'steelPainted', 'default', { color: '#1c2b46' }),
);
blocks.push(...lampRow([174, 0, -20], [1, 0, 0], 3, 14));
blocks.push(...lampRow([174, 0, 20], [1, 0, 0], 3, 14));

entities.push(
  { kind: 'gem', pos: [186, 0.5, 0] },
  { kind: 'gem', pos: [195, 0.5, 9] },
  { kind: 'endPad', pos: [204, 0, 0] },
);

// -------------------------------------------------------- the other two Sisters
// Identical bridges up-river. They are why the level is called what it is, and
// they cost nothing: no collision, no gems, pure silhouette in the fog.
function sisterBridge(z: number): Block[] {
  const out: Block[] = [
    box([74, -0.3, z], [210, 0.6, DECK_Z], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
  ];
  for (const tx of [TOWER_S, TOWER_N]) {
    for (const dz of [-CHAIN_Z, CHAIN_Z]) {
      out.push(box([tx, 5, z + dz], [3, 22, 3], 'steelPainted', 'steel', { color: GOLD, noCollide: true }));
    }
  }
  for (const dz of [-CHAIN_Z, CHAIN_Z]) {
    for (let i = 0; i < HALF_SPAN / 2; i++) {
      const x0 = TOWER_S + i * 4;
      const y0 = chainY(x0);
      const y1 = chainY(x0 + 4);
      out.push(
        box([x0 + 2, (y0 + y1) / 2, z + dz], [Math.hypot(4, y1 - y0), 0.36, 0.36], 'steelPainted', 'steel', {
          rot: [0, 0, Math.atan2(y1 - y0, 4)],
          color: GOLD,
          noCollide: true,
        }),
      );
    }
  }
  return out;
}
blocks.push(...sisterBridge(-64), ...sisterBridge(-128));

blocks.push(...downtownSkyline([-190, -6, 25], 55, 5));

const spawn: Vec3 = [-40, PLAZA_Y + 0.5, 0];

export const clementeLevel: LevelDef = {
  id: 'clemente',
  name: 'The Sixth Street Bridge',
  place: 'Roberto Clemente Bridge, over the Allegheny',
  hint: 'A flat jump carries eleven units at full speed. The last gap is fourteen — take the super jump with you.',
  difficulty: 'intermediate',
  parTime: 68000,
  goldTime: 42000,
  spawn: { pos: spawn, yaw: Math.PI / 2 },
  killY: -11,
  sky: {
    top: '#6d829a',
    bottom: '#ccd2d6',
    fog: '#b6c0c8',
    fogNear: 34,
    fogFar: 210,
    sunDir: [0.35, 0.5, -0.78],
    sunColor: '#f4ecdc',
    ambient: '#8e98a4',
    skyline: 'rivers',
  },
  blocks,
  entities,
};
