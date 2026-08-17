import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { arcWalk, box, deg, portalGate, slopeDeck } from './helpers';

/**
 * Level 5 — The Jack Rabbit.
 *
 * One idea: airtime. Nothing else in the game gives the marble speed it did
 * not roll for, and a coaster gives it nothing else. Rolling tops out at 15
 * m/s; a fourteen-unit drop hands over about 20, because a rolling sphere only
 * keeps 1/1.4 of the height it spends.
 *
 *   1. The lift hill and the first drop. Twenty-two degrees up, thirty down.
 *      The crest turns fifty degrees in one corner, so the marble leaves the
 *      track there whether the player meant it to or not — that is the lesson.
 *   2. The double dip, which is what the Jack Rabbit has been famous for since
 *      1920. Two hills, each launching about fourteen and eighteen units of
 *      flight, both landing back on their own descent. The track is six wide
 *      and railed the whole way: air is the point, falling off is not.
 *   3. The ravine. Eleven units of nothing, off a lip four units above the far
 *      side. Fifteen m/s clears it; the run into it hands over twenty. This is
 *      the only place in the level where the rails stop.
 *
 * Then a 270-degree helix, banked, which at 19 m/s leans on about 9 m/s^2 of
 * the 16 that wood can give — it holds, and it is meant to feel like it only
 * just does.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

const TRACK_W = 6;
const WOOD = '#8a6746';

/**
 * One length of coaster track: deck plus both rails. The rails are what turn
 * an eighteen-unit flight from a hazard into a thrill.
 */
function trackSeg(from: Vec3, to: Vec3, rails = true): Block[] {
  const out: Block[] = [
    slopeDeck(from, to, TRACK_W, 0.6, 'wood', 'cobblestone', { color: WOOD }),
  ];
  if (rails) {
    for (const dz of [-TRACK_W / 2 + 0.25, TRACK_W / 2 - 0.25]) {
      out.push(
        slopeDeck(
          [from[0], from[1] + 0.4, from[2] + dz],
          [to[0], to[1] + 0.4, to[2] + dz],
          0.4,
          0.9,
          'steel',
          'steel',
        ),
      );
    }
  }
  // Trestle bents, the thing that makes a wooden coaster look like one.
  const n = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[2] - from[2]) / 6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    for (const dz of [-TRACK_W / 2, TRACK_W / 2]) {
      out.push(
        box([x, (y - 14) / 2, z + dz], [0.5, y + 14, 0.5], 'wood', 'default', {
          noCollide: true,
          color: '#6d5136',
        }),
      );
    }
  }
  return out;
}

// --------------------------------------------------------------- the profile
// Knots of the ride, in order. Everything between them is straight; the corners
// between them are where the marble takes off.
const PROFILE: Array<[number, number]> = [
  [-16, 0], // station
  [2, 0], // foot of the lift
  [42, 16], // crest, 21.8 degrees of lift
  [66, 2], // bottom of the first drop, 30.3 degrees
  [84, 8], // crest of the first dip
  [108, 0], // valley
  [126, 7], // crest of the second dip
  [150, -3], // valley, and the fastest point on the ride
  [162, 1], // the launch lip
];

for (let i = 0; i < PROFILE.length - 1; i++) {
  const [x0, y0] = PROFILE[i];
  const [x1, y1] = PROFILE[i + 1];
  blocks.push(...trackSeg([x0, y0, 0], [x1, y1, 0]));
}

// The lift itself gets the yellow-ramp look and a chain of dogs up the middle,
// so it reads as the one part of the ride that is doing work for you.
for (let i = 0; i < 12; i++) {
  const t = (i + 0.5) / 12;
  blocks.push(
    box([2 + 40 * t, 16 * t + 0.12, 0], [1.6, 0.16, 2.2], 'yellowRamp', 'rampYellow', {
      rot: [0, 0, deg(21.8)],
      noCollide: true,
      color: '#e0bb3c',
    }),
  );
}

// The entrance arch at the foot of the lift, fourteen units ahead of the pad.
// Kennywood's gate is the one piece of the park everybody can picture, and it
// is also the cheapest way to stop the opening frame being a plank floor.
blocks.push(
  ...portalGate([2, 0, 0], 4.2, 4.6, {
    texture: 'steelPainted',
    surface: 'steel',
    color: '#d43a2f',
    thickness: 1.4,
    beam: 1.6,
    solid: false,
  }),
  box([2, 6.9, 0], [1.5, 1.9, 13], 'steelPainted', 'default', { noCollide: true, color: '#e8b93a' }),
);

// Station canopy posts down both sides of the platform. Four units off the
// line and eight apart: a rhythm to measure the run-up against.
for (let i = 0; i < 4; i++) {
  for (const z of [-4.1, 4.1]) {
    blocks.push(
      { kind: 'cylinder', pos: [-15 + i * 5.4, 1.7, z], radius: 0.24, height: 3.4, segments: 8,
        texture: 'steel', surface: 'steel', noCollide: true, color: '#cfd4da' },
    );
  }
  blocks.push(
    box([-15 + i * 5.4, 3.6, 0], [0.4, 0.4, 9], 'steelPainted', 'default', {
      noCollide: true,
      color: '#2f5f8a',
    }),
  );
}

entities.push({ kind: 'startPad', pos: [-12, 0, 0] });
// The ravine is the one place a mistake costs the whole ride. A checkpoint on
// the run into it makes the jump a test rather than a punishment.
entities.push({ kind: 'checkpoint', pos: [108, 0, 0] });

// --------------------------------------------------------------------- gems
// Crest gems sit on the crest itself. It is tempting to hang them out in the
// launch arc, but the arc's height at a given x swings by two units between a
// 10 m/s crest and a 16 m/s one, and a gem you can only reach at one entry
// speed is a tax on airtime rather than a reward for it. The crest is the one
// point every line passes through.
const crestGem = (x: number, y: number): Entity => ({ kind: 'gem', pos: [x, y + 0.55, 0] });

entities.push(
  { kind: 'gem', pos: [12, 4.5, 0] },
  { kind: 'gem', pos: [24, 9.3, 0] },
  { kind: 'gem', pos: [36, 14.1, 0] },
  crestGem(42, 16),
  // Far enough down the drop that it is collected whether the marble lands
  // short of it and rolls through, or is still flying and passes through it.
  { kind: 'gem', pos: [63, 4.3, 0] },
  { kind: 'gem', pos: [70, 3.9, 0] },
  crestGem(84, 8),
  { kind: 'gem', pos: [108, 0.6, 0] },
  crestGem(126, 7),
  { kind: 'gem', pos: [150, -2.4, 0] },
);

// ---------------------------------------------------------------- the ravine
// The rails stop at the lip and there is a chevron across it. Below is the
// hillside the Jack Rabbit was actually built into, and then the Mon.
blocks.push(
  box([161.6, 1.9, 0], [0.4, 1.6, TRACK_W], 'steelPainted', 'default', {
    color: '#efd23c',
    noCollide: true,
  }),
);
entities.push({ kind: 'gem', pos: [167, 1.9, 0] });

for (const side of [-1, 1]) {
  for (let i = 0; i < 5; i++) {
    blocks.push(
      box([160 + i * 4, -12 - i, side * (16 + i * 3)], [5, 22, 16], 'grass', 'default', {
        noCollide: true,
        color: '#3c5233',
      }),
    );
  }
}
blocks.push(
  box([170, -30.2, 0], [220, 0.4, 240], 'water', 'water', { noCollide: true, color: '#4b6069' }),
);

// Landing apron: flat, and long enough that anything from 15 to 24 m/s off the
// lip comes down on it.
blocks.push(...trackSeg([173, -3, 0], [200, -3, 0]));
entities.push({ kind: 'gem', pos: [186, -2.4, 0] });

// ------------------------------------------------------------- the helix home
// Entered at 19 m/s heading +X. Centre sits 22 units to the right of the entry,
// so the sweep runs from 90 degrees clockwise round to -180 and comes out
// heading +Z. The rise is negative because the player travels the arc against
// the direction it was built in.
const HELIX: Vec3 = [200, 2, -22];
blocks.push(
  ...arcWalk(HELIX, 22, 7, deg(-180), deg(270), {
    rise: -5,
    thickness: 0.8,
    // Eighteen degrees, not the forty a 19 m/s turn on a 22 radius would
    // strictly want. A bank is a lip where it meets flat track, and the entry
    // is flat: eighteen leaves 9 m/s^2 for the wood to hold, out of 16.
    bank: deg(18),
    texture: 'wood',
    surface: 'cobblestone',
    outerWall: 1.4,
    innerWall: 0.5,
    color: WOOD,
  }),
);
for (const a of [40, -20, -90, -150]) {
  entities.push({
    kind: 'gem',
    pos: [
      HELIX[0] + Math.cos(deg(a)) * 22,
      // Height along the sweep: t is measured from the -180 end.
      2 - 5 * ((a + 180) / 270) + 0.7,
      HELIX[2] + Math.sin(deg(a)) * 22,
    ],
  });
}

// ------------------------------------------------------------- the brake run
// Sand: four times the grip of stone. It does not slow a rolling marble on its
// own, but it kills the skid so the last turn onto the pad is precise.
blocks.push(
  box([178, 1.7, -12], [10, 0.6, 22], 'wood', 'sand', { color: '#9a7a55' }),
  box([178, 2.7, -0.7], [10, 2, 0.6], 'steel', 'steel'),
  box([172.7, 2.7, -12], [0.6, 2, 22], 'steel', 'steel'),
  box([183.3, 2.7, -12], [0.6, 2, 22], 'steel', 'steel'),
);
entities.push({ kind: 'gem', pos: [178, 2.5, -16] }, { kind: 'endPad', pos: [178, 2, -6] });

// ------------------------------------------------------------------ the park
// The Racer running alongside, the entrance arrow, and a stand of trees. All
// silhouette, no collision — the ride is the level.
for (let i = 0; i < 22; i++) {
  const x = -30 + i * 8;
  const y = 9 + Math.sin(i * 0.72) * 7;
  const yn = 9 + Math.sin((i + 1) * 0.72) * 7;
  for (const z of [-62, -70]) {
    blocks.push(
      slopeDeck([x, y, z], [x + 9, yn, z], 4, 0.5, 'wood', 'default', {
        noCollide: true,
        color: '#7d5f42',
      }),
    );
    blocks.push(
      box([x + 4.5, (y - 2) / 2, z], [0.5, y + 2, 0.5], 'wood', 'default', {
        noCollide: true,
        color: '#6d5136',
      }),
    );
  }
}

// The arrow sign over the entrance, and something for it to stand on.
blocks.push(
  box([-29.5, -0.5, 0], [27, 1, 20], 'asphalt', 'tarmac'),
  box([-30, 8, 9], [1.2, 16, 1.2], 'steel', 'default', { noCollide: true, color: '#c8ccd2' }),
  box([-30, 15, 9], [1.6, 3.2, 14], 'steelPainted', 'default', { noCollide: true, color: '#d43a2f' }),
  box([-30, 15, 17.4], [1.6, 5.4, 5.4], 'steelPainted', 'default', {
    rot: [Math.PI / 4, 0, 0],
    noCollide: true,
    color: '#d43a2f',
  }),
);

for (let i = 0; i < 30; i++) {
  const band = i % 2 === 0 ? 1 : -1;
  const x = -40 + ((i * 37) % 26) * 9;
  const z = band > 0 ? 30 + ((i * 53) % 11) * 5 : -96 + ((i * 29) % 9) * 4;
  blocks.push(
    { kind: 'cylinder', pos: [x, 2, z], radius: 0.45, height: 4, segments: 6, texture: 'wood', surface: 'default', noCollide: true },
    { kind: 'cylinder', pos: [x, 6, z], radius: 3.6, height: 5.6, segments: 8, texture: 'grass', surface: 'grass', noCollide: true, color: '#33502c' },
  );
}

export const kennywoodLevel: LevelDef = {
  id: 'kennywood',
  name: 'The Jack Rabbit',
  place: 'Kennywood, above the Monongahela',
  hint: 'Height is speed and speed is air. Do not brake into the ravine — the lip needs fifteen.',
  difficulty: 'advanced',
  parTime: 70000,
  goldTime: 42000,
  spawn: { pos: [-12, 0.5, 0], yaw: Math.PI / 2 },
  killY: -20,
  sky: {
    top: '#20365f',
    bottom: '#e8845a',
    fog: '#a5705f',
    fogNear: 55,
    fogFar: 320,
    sunDir: [-0.62, 0.17, 0.42],
    sunColor: '#ffb974',
    ambient: '#4a4560',
    skyline: 'hills',
  },
  blocks,
  entities,
};
