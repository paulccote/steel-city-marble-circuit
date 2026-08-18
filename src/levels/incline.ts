import type { Block, Entity, LevelDef, MoverEntity, Vec3 } from '../game/types';
import {
  box,
  deg,
  downtownSkyline,
  gemLine,
  kerb,
  lampRow,
  portalGate,
  river,
  slopeDeck,
  stairFlight,
} from './helpers';

/**
 * Level 1 — The Duquesne Incline.
 *
 * The landmark is a funicular, and a funicular is one specific machine: two
 * counterweighted cars on parallel tracks, joined by a haul cable over a drum
 * at the top, so that one rises exactly as fast as the other falls and they
 * pass at the midpoint. Everything in this level is built to say that.
 *
 *   - Two cars, not one. Their movers share a period and a path, but one starts
 *     at the bottom and one at the top, which the mover clock turns into exact
 *     antiphase: they meet at half travel, over the tallest bent of the
 *     trestle, every twenty seconds.
 *   - The cars are terraced. A funicular body is a staircase of level
 *     compartments on a sloping underframe, and that stepped silhouette is the
 *     single most recognisable thing about a Duquesne car after its colour. So
 *     each car is fourteen movers: a raked underframe, an open boarding bay at
 *     the downhill end, and three compartments whose floors and roofs step up
 *     1.2 units at a time.
 *   - The track stands on a timber trestle. Cross-braced bents march down to
 *     the wooded face of Mount Washington, tallest in the middle where the
 *     hillside falls away fastest.
 *   - A station at each end: brick at Station Square, brick Victorian with an
 *     observation terrace on Grandview Avenue.
 *
 * And it is the route, not scenery. The grade is 30 degrees, which is what the
 * real one climbs; the track bed carries no collision at all, so the only way
 * off Station Square is to board a car. Teaching order is therefore: roll,
 * steer, wait and time a boarding, ride, step off. A checkpoint sits on each
 * platform, so missing a car costs a twenty-second cycle and nothing else.
 *
 * That last sentence is the load-bearing one, and making it true is what most
 * of the station geometry below is for. A level whose only route is a vehicle
 * that is present thirty per cent of the time has three ways to fail a player,
 * and each has a fix here:
 *
 *   - Not knowing where to go. Holding forward off the start pad now runs the
 *     whole plaza, the portal, the link and the platform and stops dead at a
 *     buffer stop level with the car's doorway, with the only opening in the
 *     wall beside it, painted, funnelled and with a gem hanging in it. Forward
 *     then right is a boarding.
 *   - Not being able to. Both platforms are cut to DOOR_X0..DOOR_X1, the clear
 *     width of the car's own doorway, and the quarter-unit the mover cannot be
 *     allowed to share with a static block is bridged by a separate tongue at
 *     the bottom and simply kerbed off at the top. There is no lip and no gap
 *     anywhere on either threshold.
 *   - Dying for it. The slot the car parks in has a floor — the yard, four
 *     units down, walled, with a ramp back up to the platform — and Grandview's
 *     track-side edge is kerbed end to end. Roll in when the car is away and
 *     you lose six seconds. There is nowhere at either station to lose a life.
 */

const blocks: Block[] = [];
const entities: Entity[] = [];

// ------------------------------------------------------------- the track line
//
// Everything on the hill is measured off one line: the top of the rails,
// running up +X at 30 degrees. `datum` is where a car's downhill end sits on
// that line, and the car is built entirely in offsets from it, so moving the
// whole railway is one number.

const ANG = deg(30);
const CS = Math.cos(ANG);
const SN = Math.sin(ANG);

/** Travel: 30 units of run, 17.32 of rise, 34.64 along the slope. */
const RUN = 30;
const RISE = RUN * Math.tan(ANG);
const TRAVEL: Vec3 = [RUN, RISE, 0];

/** Where a car's downhill end sits when it is parked at the bottom. */
const BASE_X = -4;
/**
 * -3.0, not -2.7. The whole lower half of the level is measured off this: the
 * boarding platform sits BAY above the rail line here, and Station Square's
 * cobbles are at y = 0. At -2.7 the platform stood 0.3 proud of the plaza, and
 * 0.3 is exactly the lip a 0.2-radius marble cannot climb — the station was
 * sealed off from the course that leads to it.
 */
const BASE_Y = -3.0;
/** Top of the rails at any x. */
const railY = (x: number) => BASE_Y + (x - BASE_X) * Math.tan(ANG);

const TRACK_A = 0; // the track the player rides
const TRACK_B = 10; // its counterweight, passing the other way

/**
 * Boarding-bay floor, as a height above the rail line under the car's datum.
 * The bay is a level floor over a raked frame, so it has to clear the frame's
 * uphill corner: 3.0 leaves about a quarter of a unit at the tightest point.
 * It is also the number that fixes both platforms — the lower one is at the
 * bay's parked height and the upper one is set below its arrival height.
 */
const BAY = 3.0;
const PLATFORM_Y = railY(BASE_X) + BAY; // 0, by construction
/**
 * Grandview's platform sits this far *below* where the bay tops out, and that
 * is the whole trick of getting off: the car keeps rising after its floor has
 * passed the platform, so the rider is simply lifted over a wall that then is
 * not there any more and drops out onto the deck. Three units of overshoot
 * opens the door for about a second either side of the reversal — two seconds
 * of window — and costs at most a three-unit drop onto cobbles, which the
 * marble takes without a bounce worth the name.
 */
const ALIGHT_DROP = 3.0;
const APRON_Y = PLATFORM_Y + RISE - ALIGHT_DROP;

/** Twenty-second cycle: seven seconds of travel, six parked, on each track. */
const PERIOD = 20;
const DWELL = 3;

// --------------------------------------------------------------------- a car
//
// Fourteen boxes that share one path. The mover clock is a pure function of
// level time, period, dwell and waypoint count, so parts built with the same
// three numbers stay welded together without any parenting.

const CAR_HALF_W = 2.7;
/** Compartment pitch along the slope; 2.4 of slope is 1.2 of step. */
const STEP = 2.4;
const STEP_RISE = STEP * SN;

function inclineCar(datum: Vec3, travel: Vec3, doorSide: -1 | 1): MoverEntity[] {
  const [dx, dy, z] = datum;
  /**
   * Every part of the car is grit, not bare stone. The default surface has a
   * restitution of 1, and on a platform that is accelerating up a slope that
   * turns into a marble bouncing half a unit clear of the floor for the whole
   * climb — airborne, which means air control only, which means the player
   * cannot steer off at the top. Sand is restitution 0.1 and four times the
   * grip: the marble sits still and stays steerable the whole way up.
   */
  const part = (
    pos: Vec3,
    size: Vec3,
    texture: MoverEntity['texture'],
    rot?: Vec3,
  ): MoverEntity => ({
    kind: 'mover',
    pos,
    size,
    rot,
    path: [travel],
    period: PERIOD,
    dwell: DWELL,
    texture,
    surface: 'sand',
  });

  const out: MoverEntity[] = [];

  // The underframe: one raked girder the whole length of the car, which is the
  // part that actually looks like it is on rails.
  out.push(
    part([dx + 5.75 * CS, dy + 5.75 * SN - 0.1, z], [11.5, 0.4, 5.0], 'steel', [0, 0, ANG]),
  );

  // The boarding bay. Level floor, panel across the downhill end, a low rail on
  // the inboard side and an open door on the outboard one — which is where the
  // platforms are, at both ends, exactly as they are on the real railway.
  out.push(part([dx + 2.15, dy + BAY - 0.2, z], [3.5, 0.4, CAR_HALF_W * 2 + 0.6], 'wood'));
  out.push(part([dx + 0.25, dy + 2.15, z], [0.6, 3.6, CAR_HALF_W * 2 + 0.6], 'incline'));
  out.push(
    part(
      [dx + 2.15, dy + BAY + 0.3, z - doorSide * (CAR_HALF_W + 0.15)],
      [3.5, 0.6, 0.3],
      'sandstone',
    ),
  );
  // Skirt under the door side, stopping level with the bay floor so it panels
  // the car in without standing in the doorway.
  out.push(
    part(
      [dx + 2.15, dy + 1.9, z + doorSide * (CAR_HALF_W + 0.15)],
      [3.5, 2.2, 0.3],
      'incline',
    ),
  );

  // Three compartments, each a box 4.1 tall whose floor and roof are 1.2 above
  // the last. They overlap vertically by more than they step, so the side reads
  // as one terraced body rather than three separate cubes.
  for (let i = 0; i < 3; i++) {
    const cx = dx + (5.5 + STEP * i) * CS;
    const top = dy + 6.6 + STEP_RISE * i;
    out.push(part([cx, top - 2.05, z], [STEP * CS, 4.1, CAR_HALF_W * 2], 'incline'));
    // Cream belt rail at window height and a dark roof cap, both proud of the
    // body: the two lines that turn a red box into a piece of rolling stock.
    // Movers take no colour tint, only a texture, so the palette has to come
    // out of the texture list — sandstone is the only pale one, and asphalt the
    // only dark one that is not also obviously a road at this size.
    out.push(part([cx, top - 0.75, z], [STEP * CS + 0.05, 0.55, CAR_HALF_W * 2 + 0.2], 'sandstone'));
    out.push(part([cx, top + 0.15, z], [STEP * CS + 0.25, 0.3, CAR_HALF_W * 2 + 0.3], 'asphalt'));
  }
  return out;
}

/**
 * The clear doorway of a car parked at the bottom, in world x: the floor
 * between the face of the end panel and the face of the first compartment.
 * Every piece of both stations is cut off these three numbers, because a door
 * a station does not line up with is a door that is not there.
 *
 *   panel face      = BASE_X + 0.55
 *   compartment face = BASE_X + 5.5 * CS - STEP * CS / 2 = BASE_X + 3.72
 *
 * Inset by a marble radius and a little: anything rolling in between DOOR_X0
 * and DOOR_X1 lands on bay floor, never on a frame member.
 */
const DOOR_X0 = BASE_X + 0.85;
const DOOR_X1 = BASE_X + 3.45;
/** The bay floor's edge on the door side; the platforms stop just clear of it. */
const CAR_EDGE_Z = -(CAR_HALF_W + 0.3);

// Car A parks at the bottom, car B parks at the top. Same period, same dwell,
// mirrored path — which is what puts them in antiphase and makes them pass.
entities.push(...inclineCar([BASE_X, BASE_Y, TRACK_A], TRAVEL, -1));
entities.push(
  ...inclineCar(
    [BASE_X + RUN, BASE_Y + RISE, TRACK_B],
    [-RUN, -RISE, 0],
    1,
  ),
);

// ----------------------------------------------------------------- the track
//
// Rails, ties and cable only, and none of it collides. That is deliberate: a
// 30-degree bed is climbable by a determined marble (the ceiling is about 32),
// and a climbable bed would make the funicular optional. Take the car.

const TRACK_X0 = BASE_X - 2.5;
const TRACK_X1 = BASE_X + RUN + 12.5;

for (const tz of [TRACK_A, TRACK_B]) {
  const from: Vec3 = [TRACK_X0, railY(TRACK_X0) - 0.35, tz];
  const to: Vec3 = [TRACK_X1, railY(TRACK_X1) - 0.35, tz];
  // Ties: a ladder of sleepers, which is what says "railway" before the rails
  // are even resolved at distance.
  const ties = Math.round((TRACK_X1 - TRACK_X0) / CS / 1.5);
  for (let i = 0; i < ties; i++) {
    const t = (i + 0.5) / ties;
    const x = TRACK_X0 + (TRACK_X1 - TRACK_X0) * t;
    blocks.push(
      box([x, railY(x) - 0.45, tz], [0.7, 0.3, 5.6], 'wood', 'default', {
        rot: [0, 0, ANG],
        noCollide: true,
        color: '#5d4632',
      }),
    );
  }
  // Two running rails and, between them, the haul cable — the thing that makes
  // one car the counterweight of the other rather than two independent lifts.
  for (const dz of [-1.9, 1.9]) {
    blocks.push(
      slopeDeck([from[0], from[1], tz + dz], [to[0], to[1], tz + dz], 0.28, 0.22, 'steel', 'steel', {
        noCollide: true,
        color: '#8d9199',
      }),
    );
  }
  blocks.push(
    slopeDeck([from[0], from[1] - 0.25, tz], [to[0], to[1] - 0.25, tz], 0.16, 0.16, 'steel', 'steel', {
      noCollide: true,
      color: '#43484f',
    }),
  );
}

// ------------------------------------------------------------- the hillside
//
// Mount Washington's face, and the reason the trestle exists. It is defined as
// an offset *below the rails* rather than as a curve of its own, which is the
// only way to guarantee it never rises through the track: a constant 1.6 of
// clearance at the two ends, bellying out to about seven in the middle where
// the two cars pass. It flattens at 18 because that is the crest, and Grandview
// Avenue is laid along the top of it half a unit higher.
const hillY = (x: number) => {
  const t = Math.max(0, Math.min(1, (x - TRACK_X0) / (TRACK_X1 - TRACK_X0)));
  return Math.min(18, railY(x) - 1.6 - 5.4 * Math.sin(Math.PI * t) ** 0.75);
};

// The face itself: tilted slabs end to end, so it is one continuous plane of
// ground rather than a staircase of blocks. It runs from just clear of the
// Grandview terrace on the north to well past track B on the south.
const HILL_Z0 = -38;
const HILL_Z1 = 42;
for (let x = TRACK_X0 - 22; x < TRACK_X1 + 12; x += 4) {
  blocks.push(
    slopeDeck(
      [x, hillY(x), (HILL_Z0 + HILL_Z1) / 2],
      [x + 4.1, hillY(x + 4.1), (HILL_Z0 + HILL_Z1) / 2],
      HILL_Z1 - HILL_Z0,
      16,
      'grass',
      'default',
      { noCollide: true, color: '#45592f' },
    ),
  );
}

// Woods on the face. Kept off the corridor the tracks and the trestle occupy —
// a tree in front of the thing the level is about is worse than no tree — and
// small, because these are the far bank of a view, not a forest to walk in.
for (let i = 0; i < 22; i++) {
  const x = TRACK_X0 - 6 + ((i * 37) % 19) * 3.1;
  // North of the tracks the woods have to start past the two platforms and the
  // Grandview terrace, or a canopy stands in the doorway of the station.
  const z = i % 2 === 0 ? -14 - ((i * 29) % 3) * 1.6 : 21 + ((i * 53) % 5) * 2.6;
  if (i % 2 === 0 && x < 8) continue;
  const y = hillY(x) + 0.4;
  blocks.push(
    { kind: 'cylinder', pos: [x, y + 1.7, z], radius: 0.32, height: 3.4, segments: 6,
      texture: 'wood', surface: 'default', noCollide: true, color: '#4a3524' },
    { kind: 'cylinder', pos: [x, y + 4.4, z], radius: 1.9, height: 4.2, segments: 8,
      texture: 'grass', surface: 'grass', noCollide: true, color: '#33502c' },
  );
}

// ------------------------------------------------------------- the trestle
//
// A bent every 4.5 units of slope: two posts, a cap beam, a sill, and a pair of
// diagonals crossing between them. The diagonals are the whole point — a bare
// pair of posts reads as stilts, and an X between them reads as timber
// engineering, which is what is actually holding this railway up.
function bent(x: number, tz: number): Block[] {
  const top = railY(x) - 0.6;
  const foot = Math.min(hillY(x), top - 1.6);
  const h = top - foot;
  const out: Block[] = [];
  const wood = { noCollide: true, color: '#6b5137' } as const;
  for (const dz of [-2.6, 2.6]) {
    out.push(box([x, foot + h / 2, tz + dz], [0.45, h, 0.45], 'wood', 'default', wood));
  }
  out.push(
    box([x, top - 0.2, tz], [0.5, 0.4, 6.0], 'wood', 'default', wood),
    box([x, foot + 0.3, tz], [0.5, 0.4, 6.0], 'wood', 'default', wood),
  );
  // Two braces, drawn corner to corner of the bay between the posts.
  const diag = Math.hypot(5.2, h - 1);
  const a = Math.atan2(h - 1, 5.2);
  for (const s of [1, -1]) {
    out.push(
      box([x, foot + h / 2, tz], [0.35, 0.3, diag], 'wood', 'default', {
        ...wood,
        rot: [s * a, 0, 0],
      }),
    );
  }
  return out;
}

for (let u = 1; u < 46; u += 4.5) {
  const x = TRACK_X0 + u * CS;
  for (const tz of [TRACK_A, TRACK_B]) blocks.push(...bent(x, tz));
}
// Longitudinal stringers tying the bents together, one per side of each track.
for (const tz of [TRACK_A, TRACK_B]) {
  for (const dz of [-2.6, 2.6]) {
    blocks.push(
      slopeDeck(
        [TRACK_X0, railY(TRACK_X0) - 1.1, tz + dz],
        [TRACK_X1, railY(TRACK_X1) - 1.1, tz + dz],
        0.4,
        0.4,
        'wood',
        'default',
        { noCollide: true, color: '#6b5137' },
      ),
    );
  }
}

// --------------------------------------------------------- Station Square
//
// The lower station: a brick shed at the foot of the hill, with the boarding
// platform along the outboard side of track A at the height the bay parks at.

const PLAT_Z0 = -11;
/** 0.25 clear of the car's floor edge, and bridged by the tongue below. */
const PLAT_Z1 = CAR_EDGE_Z - 0.25;
const PLAT_X0 = -11;
const PLAT_X1 = 5;

blocks.push(
  box(
    [(PLAT_X0 + PLAT_X1) / 2, PLATFORM_Y - 0.5, (PLAT_Z0 + PLAT_Z1) / 2],
    [PLAT_X1 - PLAT_X0, 1, PLAT_Z1 - PLAT_Z0],
    'concrete',
    'cobblestone',
    { color: '#b9b2a4' },
  ),
);
/**
 * The tongue. Everything else here is signposting; this is the part that makes
 * boarding physical. The platform stops 0.25 short of the car's floor because
 * a moving mover and a static block cannot be allowed to share space, and 0.25
 * of open air in front of a 0.4 marble is a lip it catches on and an edge it
 * drops down. So the last quarter-unit is laid separately, top face dead level
 * with the parked bay floor, spanning exactly the doorway: from platform to car
 * there is now one continuous surface with nothing to trip over.
 */
blocks.push(
  box(
    [(DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y - 0.15, (PLAT_Z1 + CAR_EDGE_Z) / 2],
    [DOOR_X1 - DOOR_X0 + 0.6, 0.3, CAR_EDGE_Z - PLAT_Z1],
    'concrete',
    'cobblestone',
    { color: '#b9b2a4' },
  ),
);
// The platform edge is kerbed everywhere except the doorway. A funicular
// platform is a wall with one gate in it, and this gate is cut to the car:
// anything that fits through it lands on bay floor.
for (const [a, b] of [[PLAT_X0, DOOR_X0], [DOOR_X1, PLAT_X1]] as const) {
  blocks.push(...kerb([a, PLATFORM_Y, PLAT_Z1], [b, PLATFORM_Y, PLAT_Z1], { color: '#6b7078' }));
}
// Paint across the gate itself, so the one gap in that wall is announced
// rather than discovered, and a cheek splayed back from its uphill jamb. The
// buffer stop is the other cheek: between them the last two units of platform
// are a funnel with the doorway at its throat, and anything rolling into it
// from the north or the west is handed to the car.
blocks.push(
  box(
    [(DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y + 0.05, PLAT_Z1 - 0.55],
    [DOOR_X1 - DOOR_X0 + 0.6, 0.1, 1.1],
    'steelPainted',
    'default',
    { noCollide: true, color: '#efd23c' },
  ),
);
blocks.push(
  ...kerb([DOOR_X0 - 0.15, PLATFORM_Y, PLAT_Z1 - 0.1], [DOOR_X0 - 1.75, PLATFORM_Y, PLAT_Z1 - 2.9], {
    color: '#c9903a',
    height: 0.45,
  }),
);
/**
 * The buffer stop, and the single most important block at this end.
 *
 * Holding forward off the checkpoint used to run nine units past the door and
 * stop against the far kerb, which reads as a dead end rather than as a
 * station: the car was behind you by then and nothing said so. The platform
 * now ends level with the far side of the doorway, so forward puts you at the
 * door and nowhere else, and from there the only opening in the wall is the
 * one directly beside you. Forward, then right, and you are aboard.
 */
const BUFFER_X = DOOR_X1 - 0.2;
blocks.push(
  box([BUFFER_X, PLATFORM_Y + 0.55, (PLAT_Z0 + PLAT_Z1) / 2], [0.4, 1.1, PLAT_Z1 - PLAT_Z0], 'steelPainted', 'default', {
    color: '#7a2230',
  }),
  box([BUFFER_X, PLATFORM_Y + 1.2, (PLAT_Z0 + PLAT_Z1) / 2], [0.75, 0.25, PLAT_Z1 - PLAT_Z0], 'sandstone', 'default', {
    noCollide: true,
    color: '#c0b49c',
  }),
);
blocks.push(
  ...kerb([PLAT_X0, PLATFORM_Y, PLAT_Z0], [PLAT_X1, PLATFORM_Y, PLAT_Z0], { color: '#6b7078' }),
  ...kerb([PLAT_X1, PLATFORM_Y, PLAT_Z0], [PLAT_X1, PLATFORM_Y, PLAT_Z1], { color: '#6b7078' }),
);

// ------------------------------------------------------------------ the yard
//
// Under the trestle, at the foot of the incline: the graded yard the railway
// is built off, walled in stone and open to the sky.
//
// It exists because a boarding bay is a hole for fourteen seconds out of
// twenty. That is unavoidable — the car has to be somewhere else for the level
// to work — but a hole at the one place the level makes you stand and wait is
// the worst possible thing to leave unfloored, and a hole you fall down while
// judging your first ever boarding is worse than that. So the slot has a
// floor. YARD_Y is set 0.97 below the lowest corner the parked car reaches, so
// nothing down here can ever be caught under a descending car, and the ramp
// climbs out at 21 degrees to rejoin the platform by the gate the player came
// in through. Missing the car now costs six seconds and a walk, not a life.
const YARD_Y = -4.3;
const YARD_Z0 = -3.4;
const YARD_Z1 = 4.6;
const RAMP_X0 = -15;
const RAMP_X1 = BASE_X - 0.6;
/** Landing at the head of the ramp, level with and abutting the plaza link. */
const LANDING_X0 = -17.6;

blocks.push(
  box([(LANDING_X0 + RAMP_X0) / 2, PLATFORM_Y - 0.5, (YARD_Z0 + YARD_Z1) / 2], [RAMP_X0 - LANDING_X0, 1, YARD_Z1 - YARD_Z0], 'concrete', 'cobblestone', {
    color: '#a49a88',
  }),
  // Thin, and packed out underneath separately. slopeDeck drops the slab by
  // half its thickness in world Y rather than along its own normal, so a thick
  // one slides a metre down the slope and leaves the hole this ramp exists to
  // remove — at 0.6 the error is two centimetres.
  slopeDeck(
    [RAMP_X0, PLATFORM_Y, (YARD_Z0 + YARD_Z1) / 2],
    [RAMP_X1, YARD_Y, (YARD_Z0 + YARD_Z1) / 2],
    YARD_Z1 - YARD_Z0,
    0.6,
    'concrete',
    'cobblestone',
    { color: '#a49a88' },
  ),
  box([(RAMP_X0 + RAMP_X1) / 2, (PLATFORM_Y + YARD_Y) / 2 - 3.2, (YARD_Z0 + YARD_Z1) / 2], [RAMP_X1 - RAMP_X0, 6, YARD_Z1 - YARD_Z0 - 0.4], 'sandstone', 'default', {
    noCollide: true,
    color: '#7d766a',
  }),
  box([(RAMP_X1 + 5.5) / 2, YARD_Y - 2.5, (YARD_Z0 + YARD_Z1) / 2], [5.5 - RAMP_X1, 5, YARD_Z1 - YARD_Z0], 'concrete', 'cobblestone', {
    color: '#a49a88',
  }),
);
// Walled on the three sides that are not the hill, so a marble that lands down
// here rolls to the ramp instead of off the next edge. Ashlar, not the kerb
// helper's default steel: this is a retaining wall holding a hillside back,
// and riveted plate at the foot of a timber trestle reads as a different
// century from everything around it.
const WALL = { height: 0.5, texture: 'sandstone', color: '#8b8172', bandColor: '#5c554a' } as const;
blocks.push(
  // The ramp's own sides stay low: its north edge runs directly under the lip
  // of the boarding platform, and anything tall there stands up through it.
  ...kerb([RAMP_X0, PLATFORM_Y, YARD_Z0], [RAMP_X1, YARD_Y, YARD_Z0], WALL),
  ...kerb([RAMP_X0, PLATFORM_Y, YARD_Z1], [RAMP_X1, YARD_Y, YARD_Z1], { ...WALL, height: 1.2 }),
  ...kerb([LANDING_X0, PLATFORM_Y, YARD_Z1], [RAMP_X0, PLATFORM_Y, YARD_Z1], { ...WALL, height: 1.2 }),
  ...kerb([LANDING_X0, PLATFORM_Y, YARD_Z0], [LANDING_X0, PLATFORM_Y, YARD_Z1], { ...WALL, height: 1.2 }),
  // The yard floor itself is walled two units high on all three open sides.
  // A marble that misses the car can arrive here at fifteen units a second and
  // still be airborne eight units out; half a unit of kerb was something it
  // flew straight over and off the far side of the world.
  ...kerb([RAMP_X1, YARD_Y, YARD_Z0], [5.5, YARD_Y, YARD_Z0], { ...WALL, height: 2 }),
  ...kerb([RAMP_X1, YARD_Y, YARD_Z1], [5.5, YARD_Y, YARD_Z1], { ...WALL, height: 2 }),
  ...kerb([5.5, YARD_Y, YARD_Z0], [5.5, YARD_Y, YARD_Z1], { ...WALL, height: 2 }),
);
// The retaining wall that carries Station Square's cobbles over the yard, and
// the mass under the yard itself. Both decorative: they only have to stop the
// station looking like it is standing on air.
blocks.push(
  box([-6, YARD_Y / 2, YARD_Z0 - 0.35], [26, -YARD_Y, 0.7], 'sandstone', 'default', {
    noCollide: true,
    color: '#8b8172',
  }),
  box([-4, YARD_Y - 5.5, (YARD_Z0 + YARD_Z1) / 2], [28, 11, YARD_Z1 - YARD_Z0 - 0.4], 'sandstone', 'default', {
    noCollide: true,
    color: '#7d766a',
  }),
);

/**
 * A station house: brick box, cornice, pitched roof, windows and a board over
 * the door. Both ends of the railway get one, at different sizes, because a
 * funicular without a building at each end is a ramp.
 */
function stationHouse(
  centre: Vec3,
  size: Vec3,
  brick: string,
  opts: { windows?: number; sign?: boolean; yaw?: number } = {},
): Block[] {
  const [cx, cy, cz] = centre;
  const [w, h, d] = size;
  const yaw = opts.yaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx: number, ly: number, lz: number): Vec3 => [
    cx + lx * c + lz * s,
    cy + ly,
    cz - lx * s + lz * c,
  ];
  const dec = { noCollide: true, rot: [0, yaw, 0] as Vec3 };
  const out: Block[] = [
    box(at(0, h / 2, 0), [w, h, d], 'brick', 'default', { ...dec, color: brick }),
    // Cornice: the course that turns a brick slab into a building.
    box(at(0, h + 0.25, 0), [w + 1.0, 0.5, d + 1.0], 'sandstone', 'default', {
      ...dec,
      color: '#c0b49c',
    }),
  ];
  // A pitched roof, built as two slabs leaning against each other.
  const pitch = deg(28);
  const halfRun = d / 2 + 0.3;
  const slabLen = halfRun / Math.cos(pitch);
  for (const side of [-1, 1]) {
    out.push(
      box(at(0, h + 0.5 + (slabLen * Math.sin(pitch)) / 2, (side * halfRun) / 2), [w + 0.6, 0.35, slabLen], 'wood', 'default', {
        noCollide: true,
        rot: [side * pitch, yaw, 0],
        color: '#4b3b34',
      }),
    );
  }
  out.push(
    box(at(0, h + 0.6 + slabLen * Math.sin(pitch), 0), [w + 0.8, 0.3, 0.5], 'wood', 'default', {
      ...dec,
      color: '#332824',
    }),
  );
  // Tall sash windows down the long faces, in the Victorian rhythm: an even
  // count, evenly spread, with a pale stone head over each.
  const n = opts.windows ?? 4;
  for (let i = 0; i < n; i++) {
    const lz = -d / 2 + (d * (i + 0.5)) / n;
    for (const side of [-1, 1]) {
      out.push(
        box(at((side * w) / 2, h * 0.55, lz), [0.35, h * 0.42, 1.1], 'glass', 'default', {
          ...dec,
          color: '#2b3138',
        }),
        box(at((side * w) / 2, h * 0.55 + h * 0.24, lz), [0.45, 0.28, 1.5], 'sandstone', 'default', {
          ...dec,
          color: '#c8bda4',
        }),
      );
    }
  }
  if (opts.sign) {
    // The name board over the entrance. No text in this engine, so it is read
    // by shape and placement: a long pale board on two brackets, hung centred
    // on the front wall where a station's name always is.
    out.push(
      box(at(-w / 2 - 0.5, h * 0.86, 0), [0.35, 1.2, d * 0.66], 'steelPainted', 'default', {
        ...dec,
        color: '#f1e6cc',
      }),
      box(at(-w / 2 - 0.5, h * 0.86, 0), [0.4, 0.35, d * 0.6], 'steelPainted', 'default', {
        ...dec,
        color: '#7a2230',
      }),
    );
  }
  return out;
}

// Station Square's shed stands off the back of the platform, and the canopy
// covers the waiting line. Deliberately the smaller of the two houses, and
// deliberately set back: at eight units from the boarding gate its roof was
// filling the whole opening frame.
blocks.push(...stationHouse([-13, 0, -17.5], [7, 4.6, 8], '#8a5a48', { windows: 2, sign: true }));
// Canopy over the platform: posts and a roof, which is what gives the opening
// frame something above eye level to roll under.
for (let i = 0; i < 4; i++) {
  for (const z of [-10.2, -4.2]) {
    blocks.push(
      // Decoration only. The southern row stands within a marble's width of
      // the doorway, and a 0.4 post in the mouth of the one opening on the
      // platform is a trap that reads as scenery.
      { kind: 'cylinder', pos: [-9.5 + i * 4.4, PLATFORM_Y + 1.9, z], radius: 0.2, height: 3.8,
        segments: 8, texture: 'steel', surface: 'steel', noCollide: true, color: '#4c4a48' },
    );
  }
}
blocks.push(
  box([-3.5, PLATFORM_Y + 4.1, -7.2], [16, 0.35, 7.4], 'wood', 'default', {
    noCollide: true,
    color: '#5f3a2d',
  }),
  box([-3.5, PLATFORM_Y + 4.5, -10.9], [16, 0.6, 0.45], 'wood', 'default', {
    noCollide: true,
    color: '#7a2230',
  }),
  box([-3.5, PLATFORM_Y + 4.5, -3.5], [16, 0.6, 0.45], 'wood', 'default', {
    noCollide: true,
    color: '#7a2230',
  }),
);

// --------------------------------------------------------------- the plaza
// Station Square itself: cobbles, the old freight terminal along the back, and
// a gate onto the platform. Two turns between the pad and the boarding gate, so
// the level has taught steering before it asks for anything else.
blocks.push(
  box([-30, -0.5, -14], [24, 1, 20], 'cobblestone', 'cobblestone'),
  box([-30, 0.4, -24.2], [24, 1.8, 0.8], 'brick', 'default', { color: '#7d5a4c' }),
  box([-42.2, 0.4, -14], [0.8, 1.8, 20], 'brick', 'default', { color: '#7d5a4c' }),
);
// The link from the plaza to the platform. Its south edge is carried all the
// way out to the platform's, because at z = -4 it left a notch of open air
// three quarters of a unit wide at the very corner the player turns.
blocks.push(box([-16.5, -0.5, (-13 + PLAT_Z1) / 2], [11, 1, PLAT_Z1 + 13], 'cobblestone', 'cobblestone'));
blocks.push(
  ...kerb([-22, 0, -12.9], [-11.2, 0, -12.9], { color: '#6b5548' }),
  // South side, in two runs: the gap between them is the head of the yard ramp.
  ...kerb([-22, 0, PLAT_Z1], [LANDING_X0, 0, PLAT_Z1], { color: '#6b5548' }),
  ...kerb([RAMP_X0, 0, PLAT_Z1], [-11.2, 0, PLAT_Z1], { color: '#6b5548' }),
  // The plaza's two open edges: the north side as far as the gate mouth, and
  // the east side below it. Three sides of Station Square are brick and these
  // two were twelve units of unmarked drop onto the wharf.
  ...kerb([-42, 0, -3.9], [-22.2, 0, -3.9], { color: '#6b5548' }),
  ...kerb([-18.1, 0, -23.9], [-18.1, 0, -13.1], { color: '#6b5548' }),
);

for (let i = 0; i < 4; i++) {
  blocks.push(
    box([-41, 3.4, -22 + i * 5], [2.4, 7.8, 4], 'brick', 'default', {
      noCollide: true,
      color: '#7a5548',
    }),
    box([-41, 7.6, -22 + i * 5], [3, 1, 4.6], 'sandstone', 'default', {
      noCollide: true,
      color: '#b6ad9c',
    }),
  );
}

blocks.push(
  ...portalGate([-22.5, 0, -8.5], 4.0, 4.2, {
    texture: 'brick',
    surface: 'default',
    color: '#8a5a48',
    thickness: 1.5,
    beam: 1.4,
  }),
);
blocks.push(...lampRow([-38, 0, -22.6], [1, 0, 0], 4, 6));
blocks.push(...lampRow([-38, 0, -5.4], [1, 0, 0], 4, 6));

/**
 * The start line is the gate's line. It used to sit at z = -14, five and a
 * half units off the axis of the portal, which put a 1.5-unit brick column
 * dead ahead of a player holding forward off the pad — the first thing the
 * first level of the game did was stop you against a wall. Everything from the
 * pad to the boarding door is now one straight run at z = -8.5, and the gems
 * are the only reason to leave it.
 */
entities.push(
  { kind: 'startPad', pos: [-38, 0, -8.5] },
  // A shallow arc across the plaza rather than a dogleg to the back of it: on
  // the first level the gems teach steering, and three units of weave teaches
  // it as well as ten while still being catchable at speed.
  { kind: 'gem', pos: [-33, 0.5, -8.5] },
  { kind: 'gem', pos: [-29, 0.5, -11.5] },
  { kind: 'gem', pos: [-25, 0.5, -8.5] },
  { kind: 'gem', pos: [-19, 0.5, -7.0] },
  ...gemLine([-14, 0.5, -7.5], [-8, PLATFORM_Y + 0.5, -8.5], 2),
  // On the platform, at the door. Arming here is what makes a missed car cost
  // one twenty-second cycle instead of the whole level.
  { kind: 'checkpoint', pos: [-6, PLATFORM_Y, -8.5] },
  // The last two lead into the funnel and then through the door itself. The
  // one in the bay hangs where the car will be, which is the clearest thing
  // this level can say about what the opening in the wall is for.
  { kind: 'gem', pos: [(DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y + 0.5, PLAT_Z1 - 1.6] },
  { kind: 'gem', pos: [(DOOR_X0 + DOOR_X1) / 2, PLATFORM_Y + 0.5, CAR_EDGE_Z + 1.4] },
);

// ------------------------------------------------- Grandview Avenue, the top
//
// The upper station: a brick Victorian pile straddling both tracks, with the
// arrival platform down one side of track A and an observation terrace on the
// Grandview side, looking back down the incline at the city.

const APRON_X0 = 20;
const APRON_X1 = 34;
/**
 * The apron's edge stands 0.35 off the car's floor, which is as close as a
 * static block may come to a mover, and the gap it leaves is a sixth of the
 * marble's diameter — too narrow to fall into, too narrow to catch on.
 */
const APRON_Z1 = CAR_EDGE_Z - 0.35;
const APRON_Z0 = -10.95;
blocks.push(
  // A solid block, not a slab. Its inboard face is the wall a rider is pressed
  // against on the way up, and that face has to reach well below the platform
  // or the marble rolls out of the bay into the track slot on the approach.
  box([(APRON_X0 + APRON_X1) / 2, APRON_Y - 2.5, (APRON_Z0 + APRON_Z1) / 2], [APRON_X1 - APRON_X0, 5, APRON_Z1 - APRON_Z0], 'concrete', 'cobblestone', {
    color: '#b9b2a4',
  }),
  // Ashlar under it, so the platform reads as built into the station rather
  // than as a slab of concrete parked against the brick.
  box([(APRON_X0 + APRON_X1) / 2, APRON_Y - 6, (APRON_Z0 + APRON_Z1) / 2], [APRON_X1 - APRON_X0 - 0.6, 4, APRON_Z1 - APRON_Z0 - 0.6], 'sandstone', 'default', {
    noCollide: true,
    color: '#9c9182',
  }),
);
/**
 * And here the top does the opposite of what the bottom does: the rail along
 * the track side runs the whole length, with no gate cut in it at all.
 *
 * The bottom needs an opening because the car meets the platform there. The
 * top does not, because the car does not stop level — it keeps rising for
 * three more units, so the rider comes off it from above and lands on the
 * deck inside the rail rather than rolling across a threshold. Leaving the
 * eight units the bay rises through unkerbed bought nothing and left the one
 * ledge in the level a marble could roll off into four hundred feet of
 * Pittsburgh. Closed, the arrival platform has no fatal edge anywhere on it:
 * either you are still in the car, or you are on the deck.
 */
blocks.push(...kerb([APRON_X0, APRON_Y, APRON_Z1], [APRON_X1, APRON_Y, APRON_Z1], { color: '#6b7078' }));
blocks.push(
  box([27, APRON_Y + 0.05, APRON_Z1 - 0.75], [10, 0.1, 1.2], 'steelPainted', 'default', {
    noCollide: true,
    color: '#efd23c',
  }),
  // The far edge, broken where the stair up to Grandview leaves. A continuous
  // lip here would have sealed the only way off the arrival platform.
  ...kerb([APRON_X0, APRON_Y, APRON_Z0], [21.6, APRON_Y, APRON_Z0], { color: '#6b7078' }),
  ...kerb([28.4, APRON_Y, APRON_Z0], [APRON_X1, APRON_Y, APRON_Z0], { color: '#6b7078' }),
  ...kerb([APRON_X1, APRON_Y, APRON_Z0], [APRON_X1, APRON_Y, APRON_Z1], { color: '#6b7078' }),
  ...kerb([APRON_X0, APRON_Y, APRON_Z0], [APRON_X0, APRON_Y, APRON_Z1], { color: '#6b7078' }),
);

// The station itself: three wings, one between each pair of track slots and one
// outside each. The slots have to stay clear all the way up — a car's roof
// reaches nine units above its own rail line — so the wings are tall and the
// railway runs right through the middle of the building, which is exactly what
// the real upper station does.
const STATION_BASE = 10.5;
const STATION_TOP = railY(BASE_X + RUN) + 10;
for (const [z0, z1] of [[-13, -3.4], [3.4, 6.6], [13.4, 19] ] as const) {
  blocks.push(
    ...stationHouse(
      [30, STATION_BASE, (z0 + z1) / 2],
      [13, STATION_TOP - STATION_BASE, z1 - z0],
      '#8f5f4c',
      { windows: Math.max(2, Math.round((z1 - z0) / 4)), sign: z0 === -13 },
    ),
  );
  // A masonry plinth carrying each wing down onto the hillside, so the station
  // stands on the mountain instead of hanging over it.
  blocks.push(
    box([30, (STATION_BASE + hillY(30)) / 2 - 1, (z0 + z1) / 2], [13.6, STATION_BASE - hillY(30) + 2, z1 - z0 + 0.6], 'sandstone', 'default', {
      noCollide: true,
      color: '#9c9182',
    }),
  );
}
// The drum house over the track slots. The winding drum is the piece of
// machinery that makes two cars one machine, and it lives at the top, above the
// arriving cars, under a roof of its own.
blocks.push(
  box([32.5, STATION_TOP + 2.4, 3], [10, 1.2, 36], 'wood', 'default', {
    noCollide: true,
    color: '#4b3b34',
  }),
  box([32.5, STATION_TOP + 3.4, 3], [10.6, 0.8, 37], 'sandstone', 'default', {
    noCollide: true,
    color: '#b6ad9c',
  }),
  { kind: 'cylinder', pos: [33, STATION_TOP + 0.4, 5], radius: 2.1, height: 6, segments: 16,
    texture: 'steel', surface: 'steel', noCollide: true, color: '#5a5f66' },
);

// The stair up from the arrival platform to Grandview: 4.2 over 10.6, about 22
// degrees, which is the comfortable end of what a marble climbs. It starts at
// -10.8, inside the platform edge rather than half a unit clear of it: the gap
// left by starting it flush was 0.55 wide, and the marble is 0.4. It runs a
// little further north than the terrace's edge, so the extra rise the deeper
// overshoot cost is paid for in run rather than in gradient.
// Grandview's own level. Declared here because the stair is measured off it.
const TERRACE_Y = 18.0;
const STAIR_Z1 = -20.4;
blocks.push(
  ...stairFlight([25, APRON_Y, -10.8], [25, TERRACE_Y, STAIR_Z1], 6, 9, 'concrete', 'cobblestone'),
);
// Parapets, and they stand 1.5 proud rather than 0.8. The one gap in the
// apron's back kerb is this stair mouth, and a marble that comes up the flight
// at full roll leaves the treads and travels the last few units airborne — at
// 0.8 it could clear the parapet on the way past and drop into the slot
// between the platform and the terrace.
for (const dx of [-3.3, 3.3]) {
  blocks.push(
    slopeDeck([25 + dx, APRON_Y + 1.5, -10.8], [25 + dx, TERRACE_Y + 1.5, STAIR_Z1], 0.6, 2.3, 'concrete', 'default', {
      color: '#b9b2a4',
    }),
  );
}

// The terrace. Its west edge is the overlook: the cliff falls away four hundred
// feet to the river and the whole railway is below you, which is the view the
// level has been climbing toward.
// It sits behind and above the top of the incline rather than out level with
// the middle of it. Built the other way round, Grandview stood as a twenty-unit
// wall between the viewer and the railway from every angle north of the
// hillside — which is the angle every photograph of this place is taken from.
// Its south edge is where the stair lands, so the deck is cut to meet it: a
// terrace that stopped short of the stair head is a slab across the route at
// knee height, and the marble climbs into its underside instead of onto it.
const TERR_Z0 = -32;
const TERR_Z1 = STAIR_Z1;
blocks.push(
  box([35, TERRACE_Y - 0.5, (TERR_Z0 + TERR_Z1) / 2], [22, 1, TERR_Z1 - TERR_Z0], 'concrete', 'cobblestone', { color: '#bfb9ab' }),
  box([24.4, TERRACE_Y + 0.6, (TERR_Z0 + TERR_Z1) / 2], [0.5, 1.2, TERR_Z1 - TERR_Z0], 'steel', 'steel'),
  box([35, TERRACE_Y + 0.6, TERR_Z0 + 0.2], [22, 1.2, 0.5], 'steel', 'steel'),
  box([45.6, TERRACE_Y + 0.6, (TERR_Z0 + TERR_Z1) / 2], [0.5, 1.2, TERR_Z1 - TERR_Z0], 'steel', 'steel'),
);
// The bluff Grandview stands on: one mass carrying the terrace, the street and
// the houses down to the hillside, with a rock face on the overlook side.
// The hillside already runs under all of Grandview, so this is only the last
// dozen units of it: a retaining wall carrying the terrace off the crest. Built
// as a free-standing bluff instead it was a cube hanging over the river with a
// terrace balanced on it.
blocks.push(
  box([36, TERRACE_Y - 6.5, -30], [24, 12, 24], 'sandstone', 'default', {
    noCollide: true,
    color: '#8b8172',
  }),
  box([36, TERRACE_Y - 0.9, -30], [25, 0.5, 25], 'sandstone', 'default', {
    noCollide: true,
    color: '#a49a88',
  }),
);
// The terrace's north edge, either side of the stair mouth. Twenty units of
// drop straight onto the trestle, and the one edge up here with a route
// crossing it.
for (const [a, b] of [[24.4, 21.4], [28.3, 46]] as const) {
  if (b > a) blocks.push(...kerb([a, TERRACE_Y, TERR_Z1], [b, TERRACE_Y, TERR_Z1], { height: 0.5 }));
}
// Grandview Avenue itself, along the back of the terrace, and the row of houses
// on its far side that every photograph of this view has in it.
blocks.push(
  box([35, TERRACE_Y - 0.5, -36], [22, 1, 8], 'asphalt', 'tarmac'),
  ...lampRow([27, TERRACE_Y, -33.4], [1, 0, 0], 4, 6),
);
for (let i = 0; i < 5; i++) {
  blocks.push(
    box([26 + i * 5.4, TERRACE_Y + 4, -44], [4.8, 8, 8], 'brick', 'default', {
      noCollide: true,
      color: ['#7a5a4c', '#6f5c52', '#8a5a48'][i % 3],
    }),
    box([26 + i * 5.4, TERRACE_Y + 8.3, -44], [5.4, 0.6, 8.6], 'sandstone', 'default', {
      noCollide: true,
      color: '#b6ad9c',
    }),
  );
}

entities.push(
  { kind: 'checkpoint', pos: [27, APRON_Y, -7] },
  // Along the strip of deck the rider drops onto, not out in the middle of the
  // platform: the gems are the instruction for getting off, so they have to lie
  // exactly where getting off puts you.
  ...gemLine([22.5, APRON_Y + 0.5, APRON_Z1 - 1.1], [30.5, APRON_Y + 0.5, APRON_Z1 - 1.1], 3),
  ...gemLine([31, TERRACE_Y + 0.5, -22.5], [31, TERRACE_Y + 0.5, -29], 2),
  { kind: 'gem', pos: [42, TERRACE_Y + 0.5, -28] },
  // On the overlook rail, facing back down the railway. The last thing this
  // level does is turn you round to look at what you just rode.
  { kind: 'endPad', pos: [27, TERRACE_Y, -25] },
);

// -------------------------------------------------------------- distant scenery
// Station Square's wharf. Everything from the plaza to the boarding platform
// sits at y = 0 and the Monongahela is twenty-six units below it: without a
// bank under it the whole lower half of the level floats on the river.
// Both masses stop at the yard's retaining wall rather than running on under
// the tracks: built to z = -1 they buried the whole of the yard, and the
// bottom half of a parked car with it.
blocks.push(
  box([-24, -13.5, (-27 + YARD_Z0) / 2], [42, 27, YARD_Z0 + 27], 'sandstone', 'default', { noCollide: true, color: '#7d766a' }),
  box([-24, -0.1, (-27.75 + YARD_Z0) / 2], [43.5, 0.4, YARD_Z0 + 27.75], 'sandstone', 'default', { noCollide: true, color: '#a49a88' }),
);
// The Monongahela at the foot of the hill and downtown across it, which is what
// you are actually looking at from Grandview.
blocks.push(...river([-90, -26, -20], 420, 200));
blocks.push(...downtownSkyline([-150, -24, 30], 62, 7));

export const inclineLevel: LevelDef = {
  id: 'incline',
  name: 'The Duquesne Incline',
  place: 'Station Square → Mount Washington',
  hint: 'W A S D to roll, mouse to look. Follow the gems to the platform and hold W to the buffer stop. When a car is waiting in the gap beside you, roll into it (D), hold W all the way up, then roll out onto Grandview (A) as the car rises past the platform.',
  difficulty: 'beginner',
  parTime: 90000,
  goldTime: 62000,
  spawn: { pos: [-38, 0.5, -8.5], yaw: Math.PI / 2 },
  killY: -12,
  sky: {
    top: '#4d8fd6',
    bottom: '#cfe4f5',
    fog: '#bcd7ec',
    fogNear: 110,
    fogFar: 360,
    sunDir: [-0.4, 0.75, 0.5],
    sunColor: '#fff3dd',
    ambient: '#6f8296',
    skyline: 'downtown',
  },
  blocks,
  entities,
};
