import type { Block, Entity, LevelDef, Vec3 } from '../game/types';
import { box, downtownSkyline, gemLine, lampRow, portalGate, river, trussBridge } from './helpers';

/**
 * Level 1 — The Duquesne Incline.
 *
 * Teaching level. It asks for exactly three things in order: roll in a
 * straight line, steer through a turn, and climb a slope. Everything else is
 * scenery. The incline itself is the tutorial: it is shallow enough that a
 * player who just holds W will make it, and the gems sit on the racing line.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

// ------------------------------------------------------- Station Square plaza

blocks.push(
  box([0, -0.5, 0], [26, 1, 26], 'cobblestone', 'cobblestone'),
  // Low brick wall around the plaza edge, open toward the incline.
  box([0, 0.4, -13.2], [26, 1.6, 0.8], 'brick', 'default'),
  box([0, 0.4, 13.2], [26, 1.6, 0.8], 'brick', 'default'),
  box([-13.2, 0.4, 0], [0.8, 1.6, 26], 'brick', 'default'),
);

// The old freight terminal facade: a flat of brick that gives the plaza a back.
for (let i = 0; i < 5; i++) {
  blocks.push(
    box([-14.5, 3, -10 + i * 5], [1.2, 7, 4], 'brick', 'default', { noCollide: true }),
    box([-14.5, 5.5, -10 + i * 5], [1.6, 1.2, 4.6], 'sandstone', 'default', {
      noCollide: true}),
  );
}

// The lower station canopy. It stands over the start pad, and it is the single
// biggest thing stopping this opening frame from being a paved square: at 0.45
// rad of camera pitch the top of the frame is only about four degrees above
// the horizon, so a roof four units up fills it, and the posts fill the sides
// where an empty plaza put nothing at all.
// It sits *ahead* of the pad, not over it. A roof above the camera fills the
// top of the frame with its own underside and drops the whole plaza into
// shadow; a roof you are about to roll under frames what is past it.
for (let i = 0; i < 3; i++) {
  for (const z of [-5, 5]) {
    blocks.push(
      { kind: 'cylinder', pos: [-7 + i * 4.6, 2.2, z], radius: 0.22, height: 4.4, segments: 8,
        texture: 'steel', surface: 'steel', color: '#5d4a3a' },
    );
  }
}
blocks.push(
  box([-1, 4.9, 0], [13, 0.4, 11.6], 'wood', 'default', { noCollide: true, color: '#7d4a3a' }),
  box([-1, 5.35, -5.6], [13, 0.6, 0.5], 'wood', 'default', { noCollide: true, color: '#5f3a2d' }),
  box([-1, 5.35, 5.6], [13, 0.6, 0.5], 'wood', 'default', { noCollide: true, color: '#5f3a2d' }),
);

// The gate out of the plaza toward the hillside, plus a kerb and two planters
// to break twenty-six units of unrelieved cobble.
blocks.push(
  ...portalGate([9, 0, 0], 4.6, 4.4, {
    texture: 'brick',
    surface: 'default',
    color: '#8a5a48',
    thickness: 1.6,
    beam: 1.4,
  }),
  // Decoration only. A 0.3-tall kerb across the racing line stopped a marble
  // rolling at full speed stone dead — it is a line for the eye, so it has no
  // business being a line for the physics.
  box([3, 0.08, 0], [0.5, 0.3, 26], 'concrete', 'default', { noCollide: true, color: '#9aa0a6' }),
);
for (const z of [-9.5, 9.5]) {
  blocks.push(
    box([-3, 0.45, z], [7, 0.9, 5], 'brick', 'default', { color: '#7d5a4c' }),
    box([-3, 0.95, z], [7.6, 0.3, 5.6], 'grass', 'grass', { noCollide: true, color: '#3f5d33' }),
  );
}

blocks.push(...lampRow([-8, 0, -11.6], [1, 0, 0], 4, 6));
blocks.push(...lampRow([-8, 0, 11.6], [1, 0, 0], 4, 6));

entities.push(
  { kind: 'startPad', pos: [-8, 0, 0] },
  ...gemLine([-2, 0.5, -6], [-2, 0.5, 6], 3),
);

// --------------------------------------------------------- the approach street

// A cobblestone street running east out of the plaza toward the hillside, with
// a kink in it so the player has to steer rather than hold one key.
blocks.push(
  box([20, -0.5, 0], [16, 1, 9], 'cobblestone', 'cobblestone'),
  box([20, 0.2, -4.8], [16, 0.6, 0.6], 'steel', 'steel'),
  box([20, 0.2, 4.8], [16, 0.6, 0.6], 'steel', 'steel'),
);

// The kink: the street steps sideways before the bridge.
blocks.push(
  box([32, -0.5, -5], [10, 1, 9], 'cobblestone', 'cobblestone'),
  box([32, 0.2, -9.3], [10, 0.6, 0.6], 'steel', 'steel'),
);

entities.push(...gemLine([16, 0.5, 0], [26, 0.5, -2], 3));

// ------------------------------------------------------- bridge over the tracks

blocks.push(...trussBridge([37, -0.25, -5], 18, 8));
entities.push({ kind: 'powerup', type: 'superJump', pos: [46, 0.9, -5] });

// --------------------------------------------------------------- the hillside

// Mount Washington's face. Big, blocky, non-colliding except the top ledge —
// its job is to make the climb feel like a climb.
for (let i = 0; i < 9; i++) {
  const h = 6 + i * 2.4;
  blocks.push(
    box([60 + i * 5, h / 2 - 6, -26], [6, h, 34], 'sandstone', 'default', {
      noCollide: true,
      color: '#9c8a6b'}),
    box([60 + i * 5, h / 2 - 6, 26], [6, h, 34], 'sandstone', 'default', {
      noCollide: true,
      color: '#9c8a6b'}),
  );
}

// ------------------------------------------------------------- the incline itself

const INCLINE_BOTTOM: Vec3 = [56, 0, -5];
const INCLINE_RUN = 43;
const INCLINE_RISE = 20;
const inclineAngle = Math.atan2(INCLINE_RISE, INCLINE_RUN);
const inclineLength = Math.hypot(INCLINE_RUN, INCLINE_RISE);
const inclineCenter: Vec3 = [
  INCLINE_BOTTOM[0] + INCLINE_RUN / 2,
  INCLINE_BOTTOM[1] + INCLINE_RISE / 2,
  INCLINE_BOTTOM[2],
];

// The track bed. 25 degrees: gravity pulls at 8.5 m/s² along the slope and
// rolling friction can deliver about 12, so holding W is enough to climb but
// stopping halfway means sliding back.
blocks.push(
  box(inclineCenter, [inclineLength, 0.7, 10], 'wood', 'default', {
    rot: [0, 0, inclineAngle]}),
);

// Rails and ties, the visual signature of the incline.
for (const side of [-3.2, 3.2]) {
  blocks.push(
    box([inclineCenter[0], inclineCenter[1] + 0.5, inclineCenter[2] + side], [inclineLength, 0.25, 0.4], 'steel', 'steel', {
      rot: [0, 0, inclineAngle]}),
  );
}
for (const side of [-5.3, 5.3]) {
  blocks.push(
    box([inclineCenter[0], inclineCenter[1] + 1.1, inclineCenter[2] + side], [inclineLength, 0.3, 0.3], 'steelPainted', 'steel', {
      rot: [0, 0, inclineAngle],
      noCollide: true}),
  );
}

// Gems up the slope, on the line a rolling marble naturally takes.
for (let i = 0; i < 5; i++) {
  const t = 0.15 + i * 0.18;
  entities.push({
    kind: 'gem',
    pos: [
      INCLINE_BOTTOM[0] + INCLINE_RUN * t,
      INCLINE_BOTTOM[1] + INCLINE_RISE * t + 0.75,
      INCLINE_BOTTOM[2] + Math.sin(i * 1.1) * 2.4,
    ],
  });
}

// The incline car: a red cable car that runs the length of the track. It is a
// moving platform, so a player who waits can ride instead of climb.
entities.push({
  kind: 'mover',
  pos: [INCLINE_BOTTOM[0] + 4, INCLINE_BOTTOM[1] + 1.6, INCLINE_BOTTOM[2] + 0],
  size: [6, 0.5, 7],
  rot: [0, 0, inclineAngle],
  path: [[INCLINE_RUN - 9, INCLINE_RISE - 4.2, 0]],
  period: 16,
  dwell: 1.5,
  texture: 'incline',
  surface: 'default',
});

// ----------------------------------------------------------- Mount Washington

const TOP_Y = INCLINE_RISE;
const TOP_X = INCLINE_BOTTOM[0] + INCLINE_RUN;

blocks.push(
  box([TOP_X + 10, TOP_Y - 0.5, -5], [24, 1, 24], 'concrete', 'default'),
  // Grandview Avenue's overlook railing.
  box([TOP_X + 10, TOP_Y + 0.6, -16.6], [24, 1.2, 0.4], 'steel', 'steel'),
  box([TOP_X + 22, TOP_Y + 0.6, -5], [0.4, 1.2, 24], 'steel', 'steel'),
  box([TOP_X + 10, TOP_Y + 0.6, 6.6], [24, 1.2, 0.4], 'steel', 'steel'),
);

blocks.push(...lampRow([TOP_X + 2, TOP_Y, -15], [1, 0, 0], 4, 6));

entities.push(
  ...gemLine([TOP_X + 4, TOP_Y + 0.5, -12], [TOP_X + 16, TOP_Y + 0.5, 2], 4),
  { kind: 'endPad', pos: [TOP_X + 18, TOP_Y, -5] },
);

// -------------------------------------------------------------- distant scenery

blocks.push(...river([40, -8, 40], 260, 46));
blocks.push(...river([40, -8, -60], 220, 40));
blocks.push(...downtownSkyline([10, -6, 60], 90, 7));

export const inclineLevel: LevelDef = {
  id: 'incline',
  name: 'The Duquesne Incline',
  place: 'Station Square → Mount Washington',
  hint: 'W A S D to roll, mouse to look, Space to jump. Collect every gem, then reach the pad.',
  difficulty: 'beginner',
  parTime: 60000,
  goldTime: 38000,
  spawn: { pos: [-8, 0.5, 0], yaw: Math.PI / 2 },
  killY: -25,
  sky: {
    top: '#4d8fd6',
    bottom: '#cfe4f5',
    fog: '#bcd7ec',
    fogNear: 90,
    fogFar: 340,
    sunDir: [-0.4, 0.75, 0.5],
    sunColor: '#fff3dd',
    ambient: '#6f8296',
    skyline: 'downtown',
  },
  blocks,
  entities,
};
