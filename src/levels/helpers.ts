import type { Block, Entity, SurfaceName, TextureName, Vec3 } from '../game/types';

/** Shared scenery builders so every Pittsburgh level speaks the same visual language. */

export const add = (into: Block[], ...blocks: Block[]) => {
  into.push(...blocks);
  return into;
};

export function box(
  pos: Vec3,
  size: Vec3,
  texture: TextureName = 'concrete',
  surface: SurfaceName = 'default',
  extra: Partial<Block> = {},
): Block {
  return { kind: 'box', pos, size, texture, surface, ...extra } as Block;
}

export function ramp(
  pos: Vec3,
  size: Vec3,
  rot: Vec3 = [0, 0, 0],
  texture: TextureName = 'concrete',
  surface: SurfaceName = 'default',
): Block {
  return { kind: 'ramp', pos, size, rot, texture, surface };
}

/** A walkable deck with a low kerb on both long edges, so you can feel the edge. */
export function deck(
  center: Vec3,
  length: number,
  width: number,
  texture: TextureName = 'concrete',
  surface: SurfaceName = 'default',
  withKerb = true,
): Block[] {
  const out: Block[] = [
    box(center, [length, 0.6, width], texture, surface),
  ];
  if (withKerb) {
    const y = center[1] + 0.3;
    const x0 = center[0] - length / 2;
    const x1 = center[0] + length / 2;
    for (const dz of [-width / 2 + 0.15, width / 2 - 0.15]) {
      out.push(...kerb([x0, y, center[2] + dz], [x1, y, center[2] + dz]));
    }
  }
  return out;
}

/**
 * A kerb along one straight edge, drawn twice.
 *
 * A platform rim that just stops is found by falling off it. Marble Blast's
 * rims read at speed because there are two marks on them: a raised lip the eye
 * catches in silhouette, and a darker band under it the eye catches when the
 * lip is edge-on and invisible. This draws both from the two endpoints of the
 * edge, so a sloped edge gets a sloped kerb.
 *
 * 0.3 is the tallest lip a 0.2-radius marble cannot climb, which makes this a
 * wall for anything rolling *along* the deck and a full stop for anything
 * crossing it. So it goes on edges that run with the route, never across one —
 * for the edges you are meant to leave, see `dropLip`.
 */
export function kerb(
  from: Vec3,
  to: Vec3,
  opts: {
    height?: number;
    /** Kerb thickness across the edge. */
    width?: number;
    texture?: TextureName;
    color?: string;
    /** Set false where a lip would block a landing; the band still draws. */
    solid?: boolean;
    /** Painted band on the deck under the lip. */
    band?: boolean;
    bandColor?: string;
  } = {},
): Block[] {
  const h = opts.height ?? 0.3;
  const w = opts.width ?? 0.3;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const rise = to[1] - from[1];
  const run = Math.hypot(dx, dz);
  const len = Math.hypot(run, rise);
  const yaw = Math.atan2(-dz, dx);
  const pitch = Math.atan2(rise, run);
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const out: Block[] = [];
  if (opts.solid !== false) {
    out.push(
      box([mid[0], mid[1] + h / 2, mid[2]], [len, h, w], opts.texture ?? 'steel', 'default', {
        rot: [0, yaw, pitch],
        color: opts.color,
      }),
    );
  }
  if (opts.band !== false) {
    // Sits 0.05 proud of the deck and straddles the rim, so half of it hangs
    // over the drop and darkens the corner the marble is about to reach.
    out.push(
      box([mid[0], mid[1] + 0.05, mid[2]], [len, 0.1, 0.62], opts.texture ?? 'steel', 'default', {
        rot: [0, yaw, pitch],
        noCollide: true,
        color: opts.bandColor ?? '#2c3037',
      }),
    );
  }
  return out;
}

/**
 * The other kind of edge: one the player is meant to go off. A kerb here would
 * be a trap, so the mark is paint plus two chevron boards standing clear of the
 * racing line — the same language a real road uses at a bridge lift, and read
 * from far enough back that there is still time to act on it.
 */
export function dropLip(
  edge: Vec3,
  span: number,
  opts: { yaw?: number; boards?: boolean; color?: string } = {},
): Block[] {
  const yaw = opts.yaw ?? 0;
  const color = opts.color ?? '#efd23c';
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Local frame: the route runs along +X, the lip spans Z.
  // Everything here sits *on* the deck, so the paint is offset half its own
  // thickness above it rather than centred on it and half buried.
  const at = (lx: number, ly: number, lz: number): Vec3 => [
    edge[0] + lx * c + lz * s,
    edge[1] + ly,
    edge[2] - lx * s + lz * c,
  ];
  const out: Block[] = [
    // Hazard banding across the last unit and a half of deck. Dark on the
    // outside, yellow inboard of it: the decks these go on are gold steel and
    // pale concrete, and against both of those it is the dark band that carries
    // the edge — the yellow only says which kind of edge it is.
    box(at(-0.35, 0.05, 0), [0.7, 0.1, span], 'steelPainted', 'default', {
      rot: [0, yaw, 0],
      noCollide: true,
      color: '#22262c',
    }),
    box(at(-0.95, 0.05, 0), [0.5, 0.1, span], 'steelPainted', 'default', {
      rot: [0, yaw, 0],
      noCollide: true,
      color,
    }),
  ];
  if (opts.boards !== false) {
    // Outboard of the lane and 1.6 tall: tall enough to break the horizon from
    // a marble's eye, narrow enough not to hide the landing beyond it.
    for (const lz of [-span / 2 - 0.5, span / 2 + 0.5]) {
      out.push(
        box(at(-0.6, 0.8, lz), [0.35, 1.6, 1.2], 'steelPainted', 'default', {
          rot: [0, yaw, 0],
          noCollide: true,
          color,
        }),
      );
    }
  }
  return out;
}

/**
 * A distant, non-colliding skyline. Pittsburgh reads instantly from its
 * silhouette — a cluster of towers in the point between two rivers — so every
 * level places one on the horizon for orientation.
 *
 * Towers land between 0.75 and 1.2 of `radius` from the centre, so the cluster
 * is nearly two and a half radii across and the caller has to keep all of that
 * off the course. Placed by eye it did not: a 55-unit glass tower stood in the
 * middle of the Station Square plaza, no collision, full apparent solidity, and
 * no way for a player to tell which of the two blocks in front of them was the
 * real one. Nothing in here is walkable, so nothing in here belongs within
 * about fifty units of anything that is.
 */
export function downtownSkyline(center: Vec3, radius: number, seed = 1): Block[] {
  const out: Block[] = [];
  let s = seed;
  const rnd = () => {
    // Deterministic, so the skyline is identical every load.
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const towers = 34;
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + rnd() * 0.3;
    const dist = radius * (0.75 + rnd() * 0.45);
    const h = 14 + rnd() * 60;
    const w = 6 + rnd() * 10;
    out.push(
      box(
        [center[0] + Math.cos(a) * dist, center[1] + h / 2, center[2] + Math.sin(a) * dist],
        [w, h, w],
        'glass',
        'default',
        { noCollide: true, color: '#5a6f88' },
      ),
    );
  }

  // The two tallest get the pointed profile of the US Steel Tower and PPG
  // Place, which is what makes the silhouette specifically Pittsburgh.
  out.push(
    box([center[0] - 18, center[1] + 62, center[2] - radius * 0.8], [16, 124, 16], 'rust', 'default', {
      noCollide: true,
      color: '#7a5a44'}),
  );
  for (let i = 0; i < 6; i++) {
    const h = 70 - i * 8;
    out.push(
      box(
        [center[0] + 22 + (i % 3) * 9, center[1] + h / 2, center[2] - radius * 0.75 + Math.floor(i / 3) * 9],
        [8, h, 8],
        'glass',
        'default',
        { noCollide: true, color: '#8fa8c4' },
      ),
    );
  }
  return out;
}

/** A wide, non-colliding river plane with a bank on the far side. */
export function river(center: Vec3, length: number, width: number): Block[] {
  return [
    box(center, [length, 0.4, width], 'water', 'water', { noCollide: true }),
  ];
}

/** A steel truss bridge span: deck, side trusses, and portal frames. */
export function trussBridge(
  start: Vec3,
  length: number,
  width: number,
  texture: TextureName = 'steelPainted',
): Block[] {
  const out: Block[] = [];
  const [x, y, z] = start;
  out.push(box([x + length / 2, y, z], [length, 0.5, width], texture, 'steel'));

  // The truss itself is all decoration, so without these the deck is an
  // unmarked plank with a drop either side of it. The kerb rides on the deck
  // top, at y + half the deck's 0.5 thickness.
  for (const dz of [-width / 2 + 0.15, width / 2 - 0.15]) {
    out.push(...kerb([x, y + 0.25, z + dz], [x + length, y + 0.25, z + dz], { color: '#5b6470' }));
  }

  const trussHeight = 3.4;
  for (const side of [-1, 1]) {
    const zz = z + (side * width) / 2;
    // Top chord.
    out.push(
      box([x + length / 2, y + trussHeight, zz], [length, 0.35, 0.35], texture, 'steel', {
        }),
    );
    // Diagonals: alternating, which is what gives a truss its read at speed.
    const bays = Math.max(4, Math.round(length / 6));
    const bayLen = length / bays;
    for (let i = 0; i < bays; i++) {
      const cx = x + i * bayLen + bayLen / 2;
      const angle = Math.atan2(trussHeight, bayLen) * (i % 2 === 0 ? 1 : -1);
      const len = Math.hypot(trussHeight, bayLen);
      out.push({
        kind: 'box',
        pos: [cx, y + trussHeight / 2, zz],
        size: [len, 0.26, 0.26],
        rot: [0, 0, angle],
        texture,
        surface: 'steel',
        noCollide: true,
      });
      out.push(
        box([x + i * bayLen, y + trussHeight / 2, zz], [0.3, trussHeight, 0.3], texture, 'steel', {
          noCollide: true}),
      );
    }
  }

  // Portal frames at each end.
  for (const px of [x + 0.4, x + length - 0.4]) {
    out.push(
      box([px, y + trussHeight + 0.3, z], [0.4, 0.4, width + 0.6], texture, 'steel', {
        noCollide: true}),
    );
  }
  return out;
}

/** Degrees to radians. Level layouts read far better in degrees. */
export const deg = (d: number) => (d * Math.PI) / 180;

export interface ArcWalkOpts {
  thickness?: number;
  rise?: number;
  bank?: number;
  texture?: TextureName;
  surface?: SurfaceName;
  /** Height of a kerb on the outside / inside of the sweep. 0 for none. */
  outerWall?: number;
  innerWall?: number;
  color?: string;
}

/**
 * A curved walkway between two world angles. `ArcBlock` always sweeps
 * anticlockwise from its local +X, so this wraps the rotation arithmetic that
 * every curved level otherwise gets wrong: pass the angle you want it to start
 * at and how far round it goes, both measured in the world.
 */
export function arcWalk(
  center: Vec3,
  radius: number,
  width: number,
  fromAngle: number,
  sweep: number,
  opts: ArcWalkOpts = {},
): Block[] {
  const thickness = opts.thickness ?? 0.6;
  const out: Block[] = [
    {
      kind: 'arc',
      pos: center,
      // A negative yaw maps the arc's local angle 0 onto `fromAngle`.
      rot: [0, -fromAngle, 0],
      radius,
      angle: sweep,
      width,
      thickness,
      rise: opts.rise,
      bank: opts.bank,
      texture: opts.texture ?? 'concrete',
      surface: opts.surface ?? 'default',
      color: opts.color,
    },
  ];
  // Walls are thin arcs of their own, riding the same sweep. They are what
  // makes a banked curve readable from inside the marble's low camera.
  // A bank lifts the outer edge and drops the inner one, so the kerbs have to
  // follow or they sink into the deck on the high side.
  const lift = Math.sin(opts.bank ?? 0) * (width / 2);
  const wall = (r: number, h: number, dy: number) => {
    out.push({
      kind: 'arc',
      pos: [center[0], center[1] + h + dy, center[2]],
      rot: [0, -fromAngle, 0],
      radius: r,
      angle: sweep,
      width: 0.4,
      thickness: h + thickness + Math.abs(dy),
      rise: opts.rise,
      texture: 'steel',
      surface: 'default',
    });
  };
  if (opts.outerWall) wall(radius + width / 2 + 0.2, opts.outerWall, lift);
  if (opts.innerWall) wall(radius - width / 2 - 0.2, opts.innerWall, -lift);
  return out;
}

/**
 * A flat deck tilted to run from one point to another. Euler order is XYZ, so
 * the Z rotation is applied first and lifts the +X end; the Y rotation then
 * aims that end at the destination. Getting this pair the wrong way round is
 * how sloped platforms end up mirrored, so every ramp in every level goes
 * through here.
 */
export function slopeDeck(
  from: Vec3,
  to: Vec3,
  width: number,
  thickness = 0.5,
  texture: TextureName = 'concrete',
  surface: SurfaceName = 'default',
  extra: Partial<Block> = {},
): Block {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const run = Math.hypot(dx, dz);
  const rise = to[1] - from[1];
  return {
    kind: 'box',
    pos: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2 - thickness / 2,
      (from[2] + to[2]) / 2,
    ],
    size: [Math.hypot(run, rise), thickness, width],
    rot: [0, Math.atan2(-dz, dx), Math.atan2(rise, run)],
    texture,
    surface,
    ...extra,
  } as Block;
}

/**
 * A flight of steps that is physically a smooth ramp. A marble of radius 0.2
 * cannot climb a real 0.3-unit riser without juddering, so the treads are
 * non-colliding decoration sitting proud of a hidden slope. This is the only
 * way stairs are fun in a marble game.
 */
export function stairFlight(
  bottom: Vec3,
  top: Vec3,
  width: number,
  steps: number,
  texture: TextureName = 'concrete',
  surface: SurfaceName = 'default',
): Block[] {
  const dx = top[0] - bottom[0];
  const dz = top[2] - bottom[2];
  const run = Math.hypot(dx, dz);
  const rise = top[1] - bottom[1];
  const yaw = Math.atan2(-dz, dx);
  const angle = Math.atan2(rise, run);
  const length = Math.hypot(run, rise);

  const out: Block[] = [];
  // The slope the marble actually rolls on. Yaw aims it up the flight, and a
  // positive Z rotation lifts the +X end, matching the incline's track bed.
  out.push({
    kind: 'box',
    pos: [(bottom[0] + top[0]) / 2, (bottom[1] + top[1]) / 2 - 0.35, (bottom[2] + top[2]) / 2],
    size: [length, 0.7, width],
    rot: [0, yaw, angle],
    texture,
    surface,
  });

  // Treads: thin slabs straddling that slope so the eye reads a staircase
  // while the physics keeps rolling a clean 20-odd degrees.
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    out.push({
      kind: 'box',
      pos: [bottom[0] + dx * t, bottom[1] + rise * t, bottom[2] + dz * t],
      size: [(length / steps) * 0.96, 0.1, width],
      rot: [0, yaw, 0],
      texture,
      surface,
      noCollide: true,
      color: '#c9c4b8',
    });
  }
  return out;
}

/**
 * A gate straddling the route: two columns and a beam over the top.
 *
 * The chase camera sits 2.5 units back at 0.45 rad of downward pitch, and the
 * vertical FOV is 60 degrees, so the top edge of the frame is only about 4.2
 * degrees above the horizon. An object therefore only fits in frame if it is
 * roughly thirteen times its own height away — a 16-unit tower needs 220 units
 * of distance, by which point it is a smudge. Distant landmarks cannot carry
 * an opening shot in this game.
 *
 * What can is structure the player is about to roll through. A gate 10-25
 * units ahead runs off the top of the frame, which reads as mass rather than
 * as a cut-off, fills the two side thirds that would otherwise be floor, and
 * gives the eye something to measure speed against. Every level opens on one.
 */
export function portalGate(
  pos: Vec3,
  halfSpan: number,
  height: number,
  opts: {
    texture?: TextureName;
    surface?: SurfaceName;
    color?: string;
    /** Column footprint, along the route and across it. */
    thickness?: number;
    /** Depth of the beam over the opening. 0 leaves the gate open-topped. */
    beam?: number;
    solid?: boolean;
    /** Rotate the whole gate about Y, for routes that do not run along X. */
    yaw?: number;
  } = {},
): Block[] {
  const t = opts.thickness ?? 2.2;
  const texture = opts.texture ?? 'sandstone';
  const surface = opts.surface ?? 'default';
  const beam = opts.beam ?? 1.8;
  const yaw = opts.yaw ?? 0;
  const solid = opts.solid ?? true;
  const out: Block[] = [];
  // Local frame: the route runs along +X, the gate spans Z.
  const place = (lx: number, ly: number, lz: number, size: Vec3, noCollide = false, tex = texture, col = opts.color) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.push(
      box(
        [pos[0] + lx * c + lz * s, pos[1] + ly, pos[2] - lx * s + lz * c],
        size,
        tex,
        surface,
        { rot: [0, yaw, 0], noCollide: noCollide || !solid, color: col },
      ),
    );
  };
  for (const side of [-1, 1]) {
    place(0, height / 2, side * (halfSpan + t / 2), [t, height, t]);
    // A capital, so the column has a top even when the top is off-screen.
    place(0, height + 0.35, side * (halfSpan + t / 2), [t + 0.7, 0.7, t + 0.7], true);
  }
  if (beam > 0) {
    place(0, height + 1.2, 0, [t * 0.8, beam, (halfSpan + t) * 2], true);
  }
  return out;
}

/**
 * A rank of columns down one side of a route. Their job is parallax: a wide
 * flat plaza gives the eye nothing to measure motion against, and a rhythm of
 * verticals four or five units off the racing line gives it everything.
 */
export function colonnade(
  start: Vec3,
  dir: Vec3,
  count: number,
  spacing: number,
  height: number,
  radius = 0.55,
  texture: TextureName = 'sandstone',
  color = '#c2b79f',
): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [
      start[0] + dir[0] * spacing * i,
      start[1],
      start[2] + dir[2] * spacing * i,
    ];
    out.push(
      { kind: 'cylinder', pos: [p[0], p[1] + height / 2, p[2]], radius, height, segments: 10,
        texture, surface: 'default', noCollide: true, color },
      box([p[0], p[1] + height + 0.3, p[2]], [radius * 2.9, 0.6, radius * 2.9], texture, 'default', {
        noCollide: true,
        color,
      }),
    );
  }
  return out;
}

/** A support pier: what keeps a walkway over water from looking like it floats. */
export function pier(pos: Vec3, height: number, radius = 0.5): Block[] {
  return [
    {
      kind: 'cylinder',
      pos: [pos[0], pos[1] - height / 2, pos[2]],
      radius,
      height,
      segments: 10,
      texture: 'concrete',
      surface: 'default',
      noCollide: true,
      color: '#8d8b84',
    },
  ];
}

/**
 * A row of building fronts along a street. Non-colliding by default: they are
 * a wall the player reads, not a wall the player touches, and a Pittsburgh
 * street is mostly four-storey brick.
 */
export function facadeRow(
  start: Vec3,
  dir: Vec3,
  count: number,
  spacing: number,
  depth: number,
  colors: string[] = ['#8a5a48', '#6f5c52', '#9a7a5e', '#7d6a72'],
  solid = false,
): Block[] {
  const out: Block[] = [];
  const yaw = Math.atan2(-dir[2], dir[0]);
  for (let i = 0; i < count; i++) {
    const h = 7 + ((i * 37) % 5) * 1.6;
    const p: Vec3 = [
      start[0] + dir[0] * spacing * i,
      start[1] + h / 2,
      start[2] + dir[2] * spacing * i,
    ];
    out.push(
      box(p, [spacing * 0.94, h, depth], 'brick', 'default', {
        rot: [0, yaw, 0],
        noCollide: !solid,
        color: colors[i % colors.length],
      }),
    );
    // A cornice, because a flat brick slab reads as a box and a capped one
    // reads as a building.
    out.push(
      box([p[0], start[1] + h + 0.3, p[2]], [spacing * 0.98, 0.6, depth + 0.5], 'sandstone', 'default', {
        rot: [0, yaw, 0],
        noCollide: true,
        color: '#b6ad9c',
      }),
    );
  }
  return out;
}

/** Gems laid out in an arc, the classic Marble Blast pickup line. */
export function gemArc(center: Vec3, radius: number, count: number, startAngle = 0, sweep = Math.PI): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = startAngle + sweep * t;
    out.push({
      kind: 'gem',
      pos: [center[0] + Math.cos(a) * radius, center[1], center[2] + Math.sin(a) * radius],
    });
  }
  return out;
}

/** Gems in a straight line, spaced so you collect them all in one roll. */
export function gemLine(from: Vec3, to: Vec3, count: number): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push({
      kind: 'gem',
      pos: [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ],
    });
  }
  return out;
}

/** A row of street lamps, purely for scale and rhythm. */
export function lampRow(start: Vec3, dir: Vec3, count: number, spacing: number): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [
      start[0] + dir[0] * spacing * i,
      start[1],
      start[2] + dir[2] * spacing * i,
    ];
    out.push(
      { kind: 'cylinder', pos: [p[0], p[1] + 1.8, p[2]], radius: 0.09, height: 3.6, texture: 'steel', surface: 'steel', segments: 8 },
      box([p[0], p[1] + 3.7, p[2]], [0.5, 0.22, 0.5], 'steel', 'steel', { noCollide: true, color: '#ffe9b0' }),
    );
  }
  return out;
}
