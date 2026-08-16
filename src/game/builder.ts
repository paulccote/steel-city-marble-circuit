import * as THREE from 'three';
import type { ArcBlock, Block, BoxBlock, CylinderBlock, RampBlock, TextureName } from './types';
import { getNormalMap, getTexture } from './textures';
import { SURFACES } from '../engine/physics';
import { CollisionMesh } from '../engine/collision';

/**
 * Turns a level's block list into (a) a small number of merged meshes, one per
 * texture, and (b) a triangle soup for collision. Merging matters: a
 * Pittsburgh street scene is thousands of boxes, and one draw call per box
 * would cost more than the physics does.
 */

/** A wedge sloping down along +X, with the high edge at -X. */
function rampGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const hx = sx / 2;
  const hz = sz / 2;
  // Bottom at y=0, top edge at y=sy on the -X side.
  const v = [
    [-hx, sy, -hz],
    [-hx, sy, hz],
    [hx, 0, -hz],
    [hx, 0, hz],
    [-hx, 0, -hz],
    [-hx, 0, hz],
  ].map((p) => new THREE.Vector3(p[0], p[1] - sy / 2, p[2]));

  const [A, B, C, D, E, F] = v;
  const tris: THREE.Vector3[][] = [
    [A, C, B], [B, C, D],   // slope
    [E, F, C], [C, F, D],   // bottom
    [A, B, F], [A, F, E],   // back wall
    [A, E, C],              // side -Z
    [B, D, F],              // side +Z
  ];

  const pos: number[] = [];
  const uv: number[] = [];
  for (const t of tris) {
    for (const p of t) {
      pos.push(p.x, p.y, p.z);
      // Planar UV from the two largest axes; good enough for tiling textures.
      uv.push(p.x, p.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** A banked, optionally helical road segment swept about +Y. */
function arcGeometry(b: ArcBlock): THREE.BufferGeometry {
  const segments = b.segments ?? Math.max(8, Math.ceil(Math.abs(b.angle) * 12));
  const rise = b.rise ?? 0;
  const bank = b.bank ?? 0;
  const halfW = b.width / 2;
  const th = b.thickness;

  const ring = (i: number) => {
    const t = i / segments;
    const a = b.angle * t;
    const y = rise * t;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bankAngle = bank * t;
    // Outward direction in the XZ plane, tilted by the bank.
    const outX = ca * Math.cos(bankAngle);
    const outZ = sa * Math.cos(bankAngle);
    const outY = Math.sin(bankAngle);
    const cx = ca * b.radius;
    const cz = sa * b.radius;
    const inner = new THREE.Vector3(cx - outX * halfW, y - outY * halfW, cz - outZ * halfW);
    const outer = new THREE.Vector3(cx + outX * halfW, y + outY * halfW, cz + outZ * halfW);
    return { inner, outer };
  };

  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    u0: number,
    u1: number,
  ) => {
    const pts = [p0, p1, p2, p0, p2, p3];
    const uvs = [
      [u0, 0], [u1, 0], [u1, 1],
      [u0, 0], [u1, 1], [u0, 1],
    ];
    for (let i = 0; i < 6; i++) {
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      uv.push(uvs[i][0], uvs[i][1]);
    }
  };

  const down = new THREE.Vector3(0, -th, 0);
  for (let i = 0; i < segments; i++) {
    const a = ring(i);
    const c = ring(i + 1);
    const u0 = (i / segments) * Math.abs(b.angle) * b.radius;
    const u1 = ((i + 1) / segments) * Math.abs(b.angle) * b.radius;

    // Top surface.
    quad(a.inner, c.inner, c.outer, a.outer, u0, u1);
    // Bottom.
    const ai = a.inner.clone().add(down);
    const ao = a.outer.clone().add(down);
    const ci = c.inner.clone().add(down);
    const co = c.outer.clone().add(down);
    quad(ao, co, ci, ai, u0, u1);
    // Sides.
    quad(a.inner, ai, ci, c.inner, u0, u1);
    quad(c.outer, co, ao, a.outer, u0, u1);
  }

  // Caps, so the segment is a closed solid and the marble cannot enter it.
  const first = ring(0);
  const last = ring(segments);
  const cap = (r: { inner: THREE.Vector3; outer: THREE.Vector3 }, flip: boolean) => {
    const i0 = r.inner;
    const o0 = r.outer;
    const i1 = i0.clone().add(down);
    const o1 = o0.clone().add(down);
    const pts = flip ? [i0, o0, o1, i0, o1, i1] : [o0, i0, i1, o0, i1, o1];
    for (const p of pts) {
      pos.push(p.x, p.y, p.z);
      uv.push(p.x, p.y);
    }
  };
  cap(first, true);
  cap(last, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

function blockGeometry(b: Block): THREE.BufferGeometry {
  switch (b.kind) {
    case 'box': {
      const s = (b as BoxBlock).size;
      return new THREE.BoxGeometry(s[0], s[1], s[2]);
    }
    case 'ramp': {
      const s = (b as RampBlock).size;
      return rampGeometry(s[0], s[1], s[2]);
    }
    case 'cylinder': {
      const c = b as CylinderBlock;
      return new THREE.CylinderGeometry(c.radius, c.radius, c.height, c.segments ?? 16);
    }
    case 'arc':
      return arcGeometry(b as ArcBlock);
  }
}

/**
 * Texture repeats per world unit. Set so each material reads at a believable
 * physical size next to a 0.4-unit marble, and deliberately loose: the old
 * values packed six brick courses into a marble's width, which at any distance
 * collapsed into moire rather than into brick.
 *
 * A tile is 512px, so 0.5 here means one tile every two world units — a cobble
 * ends up about three quarters of the marble's diameter.
 */
const TEXTURE_DENSITY: Record<TextureName, number> = {
  concrete: 0.14,
  brick: 0.45,
  cobblestone: 0.5,
  steel: 0.35,
  steelPainted: 0.35,
  grass: 0.3,
  water: 0.04,
  asphalt: 0.16,
  glass: 0.18,
  wood: 0.42,
  rust: 0.5,
  ice: 0.2,
  sandstone: 0.24,
  yellowRamp: 0.4,
  incline: 0.55,
};

/**
 * How each surface answers light. Marble Blast's world reads because its
 * materials disagree with each other: painted steel is glossy and hot, stone
 * is matte and dark, glass is a mirror. One roughness for everything is what
 * makes a scene look like grey sludge.
 */
interface SurfaceLook {
  roughness: number;
  metalness: number;
  normalScale?: number;
  env?: number;
  /** Multiplied into the map; lifts a texture toward the reference's punch. */
  tint?: number;
}

const LOOK: Partial<Record<TextureName, SurfaceLook>> = {
  cobblestone: { roughness: 0.82, metalness: 0.0, normalScale: 1.15, tint: 1.12 },
  brick: { roughness: 0.9, metalness: 0.0, normalScale: 0.9, tint: 1.06 },
  concrete: { roughness: 0.92, metalness: 0.0, normalScale: 0.55 },
  asphalt: { roughness: 0.95, metalness: 0.0, normalScale: 0.5 },
  sandstone: { roughness: 0.88, metalness: 0.0, normalScale: 0.8, tint: 1.05 },
  steel: { roughness: 0.38, metalness: 0.7, normalScale: 0.8, env: 1.5 },
  steelPainted: { roughness: 0.3, metalness: 0.45, normalScale: 0.7, env: 1.3, tint: 1.08 },
  rust: { roughness: 0.85, metalness: 0.25, normalScale: 0.9 },
  wood: { roughness: 0.72, metalness: 0.0, normalScale: 0.7, tint: 1.05 },
  incline: { roughness: 0.42, metalness: 0.1, normalScale: 0.5, env: 1.2, tint: 1.08 },
  grass: { roughness: 0.95, metalness: 0.0, normalScale: 0.5, tint: 1.1 },
  glass: { roughness: 0.06, metalness: 0.9, env: 2.4, tint: 1.1 },
  ice: { roughness: 0.08, metalness: 0.2, env: 2.0 },
  water: { roughness: 0.1, metalness: 0.6, env: 1.8 },
  yellowRamp: { roughness: 0.45, metalness: 0.0, env: 1.1, tint: 1.15 },
};

const DEFAULT_LOOK: SurfaceLook = { roughness: 0.85, metalness: 0.02 };

/** Scale UVs so textures tile at a consistent world size across block types. */
function applyUvScale(geo: THREE.BufferGeometry, block: Block) {
  const texture = block.texture ?? DEFAULT_TEXTURE;
  const scale = (block.uvScale ?? 1) * (TEXTURE_DENSITY[texture] ?? 0.3);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return;

  if (block.kind === 'box') {
    // BoxGeometry UVs are 0..1 per face, so multiply by the face's world size.
    const s = (block as BoxBlock).size;
    const faceScale = [
      [s[2], s[1]], [s[2], s[1]],
      [s[0], s[2]], [s[0], s[2]],
      [s[0], s[1]], [s[0], s[1]],
    ];
    for (let f = 0; f < 6; f++) {
      const [su, sv] = faceScale[f];
      for (let i = f * 4; i < f * 4 + 4; i++) {
        uv.setXY(i, uv.getX(i) * su * scale, uv.getY(i) * sv * scale);
      }
    }
  } else {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * scale, uv.getY(i) * scale);
    }
  }
  uv.needsUpdate = true;
}

export interface BuiltGeometry {
  meshes: THREE.Mesh[];
  collision: CollisionMesh;
}

function transformOf(b: Block): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (b.rot) q.setFromEuler(new THREE.Euler(b.rot[0], b.rot[1], b.rot[2], 'XYZ'));
  m.compose(new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]), q, new THREE.Vector3(1, 1, 1));
  return m;
}

/** Merge a set of geometries that already carry world transforms. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let posCount = 0;
  for (const g of geos) posCount += g.getAttribute('position').count;

  const pos = new Float32Array(posCount * 3);
  const nrm = new Float32Array(posCount * 3);
  const uv = new Float32Array(posCount * 2);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      nrm[(o + i) * 3] = n.getX(i);
      nrm[(o + i) * 3 + 1] = n.getY(i);
      nrm[(o + i) * 3 + 2] = n.getZ(i);
      uv[(o + i) * 2] = t ? t.getX(i) : 0;
      uv[(o + i) * 2 + 1] = t ? t.getY(i) : 0;
    }
    o += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

const DEFAULT_TEXTURE: TextureName = 'concrete';

export function buildBlocks(blocks: Block[]): BuiltGeometry {
  const byKey = new Map<string, { geos: THREE.BufferGeometry[]; texture: TextureName; color?: string }>();
  const collision = new CollisionMesh();

  for (const b of blocks) {
    const geo = blockGeometry(b);
    applyUvScale(geo, b);
    // Non-indexed everywhere so collision extraction and merging stay simple.
    const solid = geo.index ? geo.toNonIndexed() : geo;
    solid.applyMatrix4(transformOf(b));
    solid.computeVertexNormals();

    const texture = b.texture ?? DEFAULT_TEXTURE;
    const key = `${texture}|${b.color ?? ''}`;
    let bucket = byKey.get(key);
    if (!bucket) byKey.set(key, (bucket = { geos: [], texture, color: b.color }));
    bucket.geos.push(solid);

    if (!b.noCollide) {
      const surface = SURFACES[b.surface ?? 'default'] ?? SURFACES.default;
      collision.addTriangles(solid.getAttribute('position').array as Float32Array, surface);
    }
  }

  const meshes: THREE.Mesh[] = [];
  for (const bucket of byKey.values()) {
    const merged = mergeGeometries(bucket.geos);
    // Repeat is baked into the UVs, so the texture itself repeats 1:1.
    const look = LOOK[bucket.texture] ?? DEFAULT_LOOK;
    const color = new THREE.Color(bucket.color ?? 0xffffff);
    if (look.tint) color.multiplyScalar(look.tint);
    const normalMap = getNormalMap(bucket.texture);
    const mat = new THREE.MeshStandardMaterial({
      map: getTexture(bucket.texture),
      normalMap,
      color,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: look.env ?? 0.55,
    });
    if (normalMap) mat.normalScale.setScalar(look.normalScale ?? 1);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    for (const g of bucket.geos) g.dispose();
  }

  collision.build();
  return { meshes, collision };
}
