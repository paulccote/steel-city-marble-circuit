import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, downtownSkyline, gemLine, lampRow } from './helpers';

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
const TOWER_S = 40;
const TOWER_N = 112;

/** Deck panel: yellow steel roadway, kerbed so the edge is felt before it is seen. */
const deckPanel = (x0: number, x1: number): Block[] => [
  box([(x0 + x1) / 2, -0.3, 0], [x1 - x0, 0.6, DECK_Z], 'steelPainted', 'steel', { color: GOLD }),
  box([(x0 + x1) / 2, 0.15, -DECK_Z / 2 + 0.15], [x1 - x0, 0.3, 0.3], 'steel', 'steel'),
  box([(x0 + x1) / 2, 0.15, DECK_Z / 2 - 0.15], [x1 - x0, 0.3, 0.3], 'steel', 'steel'),
];

// -------------------------------------------------------------- the Allegheny
blocks.push(
  box([80, -14.2, 0], [500, 0.4, 400], 'water', 'water', { noCollide: true, color: '#4a626d' }),
);

// --------------------------------------------------- south abutment, downtown
blocks.push(
  box([-40, -0.5, 0], [26, 1, 24], 'cobblestone', 'cobblestone'),
  box([-53, 0.6, 0], [1, 2.2, 24], 'concrete', 'default'),
  box([-40, 0.6, -12], [26, 2.2, 1], 'concrete', 'default'),
  box([-40, 0.6, 12], [26, 2.2, 1], 'concrete', 'default'),
);
blocks.push(...lampRow([-48, 0, -8], [1, 0, 0], 3, 8));
blocks.push(...lampRow([-48, 0, 8], [1, 0, 0], 3, 8));

entities.push({ kind: 'startPad', pos: [-46, 0, 0] });

// --------------------------------------------- beat 1: two holes in the deck
// Thirty units of run-up, about twice the distance it takes to reach the
// rolling ceiling, so the first gap is met at full pace however the player
// drives up to it.
blocks.push(...deckPanel(-28, 2));
blocks.push(...deckPanel(6.5, 20));
blocks.push(...deckPanel(26, TOWER_S));

entities.push(
  ...gemLine([-20, 0.5, 0], [-4, 0.5, 0], 2),
  // Hung in the arc of the jump rather than beside it.
  { kind: 'gem', pos: [4.25, 1.2, 0] },
  { kind: 'gem', pos: [13, 0.5, 0] },
  { kind: 'gem', pos: [23, 1.2, 0] },
  { kind: 'gem', pos: [33, 0.5, 0] },
);

// ------------------------------------------------------------------ the towers
const tower = (x: number): Block[] => {
  const out: Block[] = [];
  for (const z of [-CHAIN_Z, CHAIN_Z]) {
    out.push(box([x, 5, z], [3, 22, 3], 'steelPainted', 'steel', { color: GOLD }));
  }
  out.push(
    box([x, 16.6, 0], [3, 1.2, 13], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
    box([x, 9, 0], [2.2, 0.9, 13], 'steelPainted', 'steel', { color: GOLD, noCollide: true }),
  );
  return out;
};
blocks.push(...tower(TOWER_S), ...tower(TOWER_N));

// The eyebar chain: a parabola saddle to saddle, sagging to just above deck
// level at midspan. That profile is what makes a self-anchored suspension
// bridge readable from a mile off, and it is the only reason to look up.
const SAG_X = (TOWER_S + TOWER_N) / 2;
const HALF_SPAN = (TOWER_N - TOWER_S) / 2;
const CHAIN_K = 15 / (HALF_SPAN * HALF_SPAN);
const chainY = (x: number) => 1 + CHAIN_K * (x - SAG_X) ** 2;

for (const z of [-CHAIN_Z, CHAIN_Z]) {
  for (let i = 0; i < HALF_SPAN; i++) {
    const x0 = TOWER_S + i * 2;
    const y0 = chainY(x0);
    const y1 = chainY(x0 + 2);
    blocks.push(
      box([x0 + 1, (y0 + y1) / 2, z], [Math.hypot(2, y1 - y0), 0.36, 0.36], 'steelPainted', 'steel', {
        rot: [0, 0, Math.atan2(y1 - y0, 2)],
        color: GOLD,
        noCollide: true,
      }),
    );
  }
  // Side spans, anchored back down into the abutments.
  for (const [ax, bx, y0, y1] of [[-28, TOWER_S, 3.5, 16], [TOWER_N, 176, 16, 3.5]] as const) {
    blocks.push(
      box([(ax + bx) / 2, (y0 + y1) / 2, z], [Math.hypot(bx - ax, y1 - y0), 0.36, 0.36], 'steelPainted', 'steel', {
        rot: [0, 0, Math.atan2(y1 - y0, bx - ax)],
        color: GOLD,
        noCollide: true,
      }),
    );
  }
}

// ------------------------------------------ beat 2: the suspender platforms
// 5.5 units of platform, and grit-blasted rather than bare steel. Restitution
// matters more than length here: a steel landing bounces the marble 2.2 m/s
// back into the air and it cannot jump again until it settles, so the panels
// use stone's restitution and the marble is steerable again within two units.
const GAPS = [4.5, 5, 5.5, 6, 6.5, 7];
const PLAT = 5.5;
let edge = TOWER_S;
for (const gap of GAPS) {
  const x0 = edge + gap;
  const cx = x0 + PLAT / 2;
  blocks.push(
    box([cx, -0.3, 0], [PLAT, 0.6, 5], 'steelPainted', 'cobblestone', { color: GOLD }),
    // Cross-beam under the panel, carrying the hanger rods up to the chain.
    box([cx, -0.75, 0], [0.5, 0.3, 10.4], 'steel', 'steel', { noCollide: true }),
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

// Chevron boards at the lip. Nothing about this gap looks different from the
// last six, so the level says out loud that it is, and says it from far enough
// back to act on. Non-colliding: a warning, not a wall.
for (const z of [-3.6, 3.6]) {
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
);

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

blocks.push(...downtownSkyline([-130, -6, 30], 80, 5));

const spawn: Vec3 = [-46, 0.5, 0];

export const clementeLevel: LevelDef = {
  id: 'clemente',
  name: 'The Sixth Street Bridge',
  place: 'Roberto Clemente Bridge, over the Allegheny',
  hint: 'A flat jump carries eleven units at full speed. The last gap is fourteen — take the super jump with you.',
  difficulty: 'intermediate',
  parTime: 72000,
  goldTime: 44000,
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
