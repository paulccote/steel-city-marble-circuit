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
