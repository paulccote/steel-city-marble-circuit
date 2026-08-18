import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { arcWalk, box, deg, dropLip, kerb, portalGate, slopeDeck } from './helpers';

/**
 * Level 5 — The Jack Rabbit.
 *
 * One idea: airtime. Nothing else in the game gives the marble speed it did
 * not roll for, and a coaster gives it nothing else. Rolling tops out at 15
 * m/s; a fourteen-unit drop hands over about 20, because a rolling sphere only
 * keeps 1/1.4 of the height it spends.
 *
 *   1. The lift hill. Twenty-two degrees up, and the crest turns thirty-five
 *      degrees in one corner, so the marble leaves the track there whether the
 *      player meant it to or not — that is the lesson.
 *   2. The double dip, which is what the Jack Rabbit has been famous for since
 *      1920, and which is one descent rather than two hills: the first drop
 *      eases out onto a level shelf and then falls away again at thirty-six
 *      degrees. The break at the end of the shelf is the convex corner, and it
 *      is the biggest launch on the ride. Then two ordinary hills after it. The
 *      track is six wide and railed the whole way: air is the point, falling
 *      off is not.
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
/** Grade the whole ride is built up from. Every post lands on it. */
const GROUND = -14;
const TIMBER = { noCollide: true, color: '#6d5136' } as const;

/**
 * The trestle under one length of track.
 *
 * This is the whole identity of a 1920s wooden coaster and it is not a rank of
 * posts. It is a lattice: bents every seven units — two legs, a cap beam and two
 * horizontal ledgers — and then, between every pair of bents and on both sides,
 * a cross-brace drawn corner to corner. What a person pictures when they
 * picture the Jack Rabbit is that woven wall of timber under the track, and a
 * pair of bare stilts every six units reads as scaffolding instead.
 *
 * Tall bents get their bracing in two stacked panels rather than one. A single
 * X over twenty-five units of leg is a thin diagonal line; two are a lattice.
 */
function trestle(from: Vec3, to: Vec3): Block[] {
  const out: Block[] = [];
  const run = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const n = Math.max(1, Math.round(run / 7));
  const at = (t: number): Vec3 => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
  const bents: Vec3[] = [];
  for (let i = 0; i <= n; i++) bents.push(at(i / n));

  for (const p of bents) {
    const h = p[1] - GROUND;
    if (h < 1) continue;
    for (const dz of [-TRACK_W / 2, TRACK_W / 2]) {
      out.push(box([p[0], GROUND + h / 2, p[2] + dz], [0.5, h, 0.5], 'wood', 'default', TIMBER));
    }
    out.push(box([p[0], p[1] - 0.8, p[2]], [0.42, 0.42, TRACK_W + 0.8], 'wood', 'default', TIMBER));
    // Two ledgers on a tall bent, one on a short one. Below about nine units
    // the second is inside the cross-brace and costs a block for nothing.
    for (const f of h > 9 ? [0.34, 0.67] : [0.5]) {
      out.push(box([p[0], GROUND + h * f, p[2]], [0.34, 0.34, TRACK_W], 'wood', 'default', TIMBER));
    }
  }

  for (let i = 0; i < n; i++) {
    const a = bents[i];
    const b = bents[i + 1];
    const bay = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (bay < 0.5) continue;
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const cx = (a[0] + b[0]) / 2;
    const cz = (a[2] + b[2]) / 2;
    const h = (a[1] + b[1]) / 2 - GROUND;
    if (h < 2) continue;
    const panels = h > 14 ? [[0.04, 0.5], [0.5, 0.96]] : [[0.06, 0.94]];
    for (const [f0, f1] of panels) {
      const y0 = GROUND + h * f0;
      const y1 = GROUND + h * f1;
      const diag = Math.hypot(bay, y1 - y0);
      const ang = Math.atan2(y1 - y0, bay);
      for (const s of [1, -1]) {
        for (const dz of [-TRACK_W / 2, TRACK_W / 2]) {
          out.push(
            box([cx, (y0 + y1) / 2, cz + dz], [diag, 0.28, 0.28], 'wood', 'default', {
              ...TIMBER,
              rot: [0, yaw, s * ang],
            }),
          );
        }
      }
    }
  }
  return out;
}

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
  out.push(...trestle(from, to));
  return out;
}

// --------------------------------------------------------------- the profile
// Knots of the ride, in order. Everything between them is straight; the corners
// between them are where the marble takes off.
const PROFILE: Array<[number, number]> = [
  [-16, 0], // station
  [2, 0], // foot of the lift
  [42, 16], // crest, 21.8 degrees of lift
  // The double dip. This is the manoeuvre the Jack Rabbit has been famous for
  // since 1920 and it is one descent, not two hills: the first drop eases out
  // onto a shelf, holds it just long enough for the train to be level again,
  // and then falls away a second time and harder. The break at the end of the
  // shelf is convex, which is where the marble leaves the track — the airtime
  // is a consequence of the shape, exactly as it is on the real ride.
  [54, 11], // out of the first drop, 22.6 degrees
  [62, 9.4], // the shelf between the dips, 11.3 degrees
  [76, -1], // and away again at 36.6 into the valley
  [92, 6], // crest
  [112, -1], // valley
  [130, 6], // crest of the last hill
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
// Y of 0.35, not 0. The valley is a V between two sloped decks, and a 0.2
// marble cannot reach the vertex — it rests 0.45 up, wedged between the two
// faces. Respawning is `pos` plus one radius, so at zero the player came back
// inside the track and had to be squeezed out of it.
entities.push({ kind: 'checkpoint', pos: [112, 0.35, 0] });

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
  // On the shelf of the double dip. Everything between the crest and here is
  // concave, so the marble is still on the planking at this point whatever
  // speed it left at — which is what makes this the one collectable place on
  // the drop rather than a guess at where an arc goes.
  crestGem(62, 9.4),
  // In the valley at the foot of the second dip. Valleys are the other
  // reliable point: a V catches everything that comes down into it.
  { kind: 'gem', pos: [76, 0.2, 0] },
  crestGem(92, 6),
  { kind: 'gem', pos: [112, 0.4, 0] },
  crestGem(130, 6),
  { kind: 'gem', pos: [150, -2.4, 0] },
);

// ---------------------------------------------------------------- the ravine
// The rails stop at the lip and there is a chevron across it. Below is the
// hillside the Jack Rabbit was actually built into, and then the Mon.
// The warning used to be one board the full six units across the track, 1.6
// tall and standing straight up at the launch lip. Non-colliding, and it read
// as a wall: the one thing the player must do here is arrive at fifteen metres
// a second and go straight through it. Now it is two boards on the rails with
// the lane open between them, plus paint on the planking — which is the surface
// the player is actually looking at on the way in.
blocks.push(...dropLip([162, 1, 0], TRACK_W - 1));
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

// --------------------------------------------------------------- the ground
// The park floor the whole structure stands on. Every post in the trestle lands
// at -14, and until this was here they all landed on nothing: a wooden coaster
// whose legs stop in mid-air is a drawing of a coaster.
blocks.push(
  box([90, GROUND - 3, -26], [270, 6, 120], 'grass', 'default', {
    noCollide: true,
    color: '#3f5433',
  }),
);
// And the bluff it stands on. Kennywood is on a shelf a hundred feet above the
// Monongahela, which is the reason the ravine at the end of the ride exists.
for (let i = 0; i < 5; i++) {
  blocks.push(
    box([90 - i * 6, GROUND - 8 - i * 5, 42 + i * 8], [270 - i * 20, 14, 22], 'grass', 'default', {
      noCollide: true,
      color: i % 2 ? '#37492c' : '#3d5233',
    }),
  );
}

// ------------------------------------------------------------------ the park
// The Racer running alongside, the entrance arrow, and a stand of trees. All
// silhouette, no collision — the ride is the level. The Racer gets the same
// lattice as the Jack Rabbit at half the density: it is sixty units away and
// its only job is to say that this is a park full of wooden coasters, not one
// wooden coaster in a field.
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
    for (const dx of [0, 9]) {
      const h = (dx ? yn : y) + 2;
      blocks.push(
        box([x + dx, (dx ? yn : y) - h / 2, z], [0.5, h, 0.5], 'wood', 'default', {
          noCollide: true,
          color: '#6d5136',
        }),
      );
    }
    const mid = (y + yn) / 2;
    const diag = Math.hypot(9, mid + 2);
    const ang = Math.atan2(mid + 2, 9);
    for (const s of [1, -1]) {
      blocks.push(
        box([x + 4.5, (mid - 2) / 2, z], [diag, 0.28, 0.28], 'wood', 'default', {
          noCollide: true,
          rot: [0, 0, s * ang],
          color: '#6d5136',
        }),
      );
    }
  }
}

// The arrow sign over the entrance, and something for it to stand on.
blocks.push(
  box([-29.5, -0.5, 0], [27, 1, 20], 'asphalt', 'tarmac'),
  // Kerbs round the three open sides of it. The midway is behind the start pad,
  // so a player only meets these edges by wandering — but this is the one place
  // in the level where the ground is twenty units wide and its edge is a
  // twenty-unit drop into fog, and nothing at all was drawn on it.
  ...kerb([-43, 0, -9.85], [-16, 0, -9.85], { color: '#4e5b63' }),
  ...kerb([-43, 0, 9.85], [-16, 0, 9.85], { color: '#4e5b63' }),
  ...kerb([-42.85, 0, -10], [-42.85, 0, 10], { color: '#4e5b63' }),
  // And across the two corners the midway leaves when it narrows to the six
  // units of track at x = -16.
  ...kerb([-16.15, 0, -10], [-16.15, 0, -3.1], { color: '#4e5b63' }),
  ...kerb([-16.15, 0, 3.1], [-16.15, 0, 10], { color: '#4e5b63' }),
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
