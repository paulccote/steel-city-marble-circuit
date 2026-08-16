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
  kerb = true,
): Block[] {
  const out: Block[] = [
    box(center, [length, 0.6, width], texture, surface),
  ];
  if (kerb) {
    const y = center[1] + 0.45;
    out.push(
      box([center[0], y, center[2] - width / 2 + 0.15], [length, 0.3, 0.3], 'steel', 'default'),
      box([center[0], y, center[2] + width / 2 - 0.15], [length, 0.3, 0.3], 'steel', 'default'),
    );
  }
  return out;
}

/**
 * A distant, non-colliding skyline. Pittsburgh reads instantly from its
 * silhouette — a cluster of towers in the point between two rivers — so every
 * level places one on the horizon for orientation.
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

/** A point on a circle, for chaining arc walkways together by hand. */
export function arcPoint(center: Vec3, radius: number, angle: number, y = center[1]): Vec3 {
  return [center[0] + Math.cos(angle) * radius, y, center[2] + Math.sin(angle) * radius];
}

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
