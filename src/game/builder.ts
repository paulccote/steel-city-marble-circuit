import * as THREE from 'three';
import type { ArcBlock, Block, BoxBlock, CylinderBlock, RampBlock, TextureName } from './types';
import { getMacroMap, getNormalMap, getTexture, type MacroKind } from './textures';
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
  // `v` is handed the face's real width in world units, not 0..1. A ten-unit
  // walkway with 0..1 across it gets one tile stretched over the whole width,
  // which is why every banked curve in the game was streaked lengthways while
  // the straight decks beside it tiled correctly.
  const quad = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    u0: number,
    u1: number,
    v: number,
  ) => {
    const pts = [p0, p1, p2, p0, p2, p3];
    const uvs = [
      [u0, 0], [u1, 0], [u1, v],
      [u0, 0], [u1, v], [u0, v],
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
    quad(a.inner, c.inner, c.outer, a.outer, u0, u1, b.width);
    // Bottom.
    const ai = a.inner.clone().add(down);
    const ao = a.outer.clone().add(down);
    const ci = c.inner.clone().add(down);
    const co = c.outer.clone().add(down);
    quad(ao, co, ci, ai, u0, u1, b.width);
    // Sides.
    quad(a.inner, ai, ci, c.inner, u0, u1, th);
    quad(c.outer, co, ao, a.outer, u0, u1, th);
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
  // A repeat every seventeen units. Longer waves suited the open river and
  // turned the Point's thirty-unit fountain basin, which is this same texture,
  // into a field of dunes; shorter ones tiled into a visible mesh across four
  // hundred units of the Allegheny.
  water: 0.06,
  // A tile every eight units, so one pane of the curtain wall is about a
  // metre. At 0.28 a pane was 10cm and mipped to a flat wash long before the
  // tower did, which is what made the skyline read as coloured cardboard.
  glass: 0.12,
  asphalt: 0.16,
  wood: 0.42,
  rust: 0.5,
  ice: 0.2,
  sandstone: 0.24,
  yellowRamp: 0.4,
  incline: 0.55,
};

/**
 * The second frequency: which macro map a surface takes, how many world units
 * a repeat of it spans, and how hard it bites. The span is deliberately much
 * larger than a tile — the whole point is to break the repeat at a scale the
 * tile cannot reach — and it is measured in world units rather than tiles so
 * two surfaces of different tile size still weather at the same rate.
 */
interface MacroLook {
  kind: MacroKind;
  /** World units per repeat of the macro map. */
  span: number;
  strength: number;
}

const MACRO: Partial<Record<TextureName, MacroLook>> = {
  // A span of sixteen puts a paving course and a drainage fall inside the
  // fifteen-odd units of ground a player can actually see ahead of the
  // marble. Thirty was truer to a real plaza and completely invisible.
  cobblestone: { kind: 'paving', span: 16, strength: 0.8 },
  concrete: { kind: 'paving', span: 22, strength: 0.55 },
  asphalt: { kind: 'paving', span: 20, strength: 0.5 },
  sandstone: { kind: 'stone', span: 14, strength: 0.4 },
  brick: { kind: 'stone', span: 12, strength: 0.36 },
  grass: { kind: 'green', span: 18, strength: 0.55 },
  wood: { kind: 'stone', span: 10, strength: 0.3 },
  steel: { kind: 'metal', span: 16, strength: 0.3 },
  steelPainted: { kind: 'metal', span: 18, strength: 0.26 },
  rust: { kind: 'metal', span: 12, strength: 0.35 },
  // Long, slow runs of light and shade across the river, so the chop does not
  // tile into corduroy over four hundred units of open water.
  water: { kind: 'metal', span: 63, strength: 0.4 },
  // Wide, because this one is breaking up a row of towers rather than a
  // surface: a repeat shorter than a building would band each tower instead.
  glass: { kind: 'city', span: 41, strength: 0.42 },
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
  cobblestone: { roughness: 0.88, metalness: 0.0, normalScale: 1.0 },
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
  // Matte rather than mirrored, deliberately. A metallic tower takes its value
  // from the environment map, which is the same sky on every face, so the two
  // sides of a corner came out identical and the building read as a flat
  // cut-out. Diffuse shading is what puts a sunlit face against a shaded one.
  glass: { roughness: 0.52, metalness: 0.12, env: 0.7, tint: 0.92 },
  ice: { roughness: 0.08, metalness: 0.2, env: 2.0 },
  // Rough enough to spread the sun into a glitter path rather than one point,
  // and only lightly metallic: a fully metallic river takes all its value from
  // the environment map, which is the same sky everywhere, so it comes out as
  // one flat sheet of grey.
  water: { roughness: 0.2, metalness: 0.28, env: 1.5, normalScale: 0.45 },
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
  } else if (block.kind === 'cylinder') {
    // CylinderGeometry's UVs run 0..1 around the side and 0..1 across each cap,
    // so they need the same per-face world scaling a box gets. Without it the
    // Point's thirty-metre fountain basin and a bollard both got exactly one
    // tile, and the basin came out as a single flat colour — a sheet of mud
    // where there should have been water.
    const c = block as CylinderBlock;
    const nrm = geo.getAttribute('normal');
    const circumference = 2 * Math.PI * c.radius;
    for (let i = 0; i < uv.count; i++) {
      const cap = !nrm || Math.abs(nrm.getY(i)) > 0.9;
      const su = cap ? c.radius * 2 : circumference;
      const sv = cap ? c.radius * 2 : c.height;
      uv.setXY(i, uv.getX(i) * su * scale, uv.getY(i) * sv * scale);
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

/**
 * Fog for scenery, kept apart from the fog the scene carries. One curve cannot
 * serve both: on the Clemente the towers and the chain are the most distant
 * thing on screen and also the subject of the level, so a curve tight enough
 * to sink the skyline behind them erases the bridge with it. The scene's own
 * fog is now authored for gameplay, and only backdrop meshes take this.
 */
let backdropFog = { near: 40, far: 160 };

/** The sky colour at the horizon, which is what water reflects at a distance. */
let horizonColor = new THREE.Color(0xb8c4cc);

export function setBackdropFog(near: number, far: number, horizon?: THREE.Color) {
  backdropFog = { near, far };
  if (horizon) horizonColor = horizon.clone();
}

/**
 * How far a non-colliding block has to stand off the playable world before it
 * counts as backdrop. `noCollide` alone is not the test: the Clemente's chain,
 * its tower crossbeams and every stair tread are non-colliding and sit right
 * on top of the route. Distance from the nearest thing the marble can touch is
 * what actually separates "scenery" from "the level".
 */
const BACKDROP_STANDOFF = 22;

interface Prepared {
  geo: THREE.BufferGeometry;
  bounds: THREE.Box3;
  texture: TextureName;
  color?: string;
  backdrop: boolean;
}

/** Distance between two AABBs; zero if they touch or overlap. */
function boxDistance(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
  return Math.hypot(dx, dy, dz);
}

/**
 * A roofline for a backdrop tower. A city reads as a city where it meets the
 * sky: parapets, plant rooms, masts. A flat-topped extrusion reads as a slab
 * however good the wall texture is, which is why the horizon here has been
 * losing to the reference even after the checkerboard went away.
 */
function skylineCrown(b: BoxBlock): Block[] {
  const [w, h, d] = b.size;
  const foot = Math.max(w, d);
  if (h < 20 || foot > 26 || h < foot * 1.5) return [];
  if (b.rot && (b.rot[0] || b.rot[2])) return [];

  const top = b.pos[1] + h / 2;
  const out: Block[] = [
    // The parapet: a hard, slightly proud lip. It is one unit of geometry and
    // it is the difference between a box and a building.
    {
      kind: 'box',
      pos: [b.pos[0], top + 0.45, b.pos[2]],
      size: [w * 1.1, 0.9, d * 1.1],
      rot: b.rot,
      texture: 'concrete',
      surface: 'default',
      noCollide: true,
      color: '#6f7986',
    } as Block,
  ];

  if (h >= 40) {
    // A plant room stepped back from the parapet, and a mast on the tallest.
    const ph = Math.max(2.5, h * 0.09);
    out.push({
      kind: 'box',
      pos: [b.pos[0], top + 0.9 + ph / 2, b.pos[2]],
      size: [w * 0.58, ph, d * 0.58],
      rot: b.rot,
      texture: b.texture ?? DEFAULT_TEXTURE,
      surface: 'default',
      noCollide: true,
      color: b.color,
    } as Block);
    if (h >= 55) {
      out.push({
        kind: 'cylinder',
        pos: [b.pos[0], top + 0.9 + ph + h * 0.06, b.pos[2]],
        radius: 0.22,
        height: h * 0.12,
        segments: 5,
        texture: 'steel',
        surface: 'default',
        noCollide: true,
        color: '#8d95a0',
      } as Block);
    }
  }
  return out;
}

/**
 * World-space macro variation, and the backdrop's own fog curve. Both need to
 * know where a fragment is in the world, which the stock material does not
 * carry, so they share one pair of varyings.
 *
 * The macro map is sampled in world space rather than in UV, on purpose: box
 * UVs restart at zero on every face of every block, so a UV-space overlay
 * would repeat once per block and change nothing about a plaza built from six
 * of them.
 */
function extendMaterial(
  mat: THREE.MeshStandardMaterial,
  macro: MacroLook | undefined,
  backdrop: boolean,
  water: boolean,
  key: string,
) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;',
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vSurfPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vSurfNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;',
    );

    if (!backdrop) {
      // Sky occlusion, by face direction alone. A horizontal face sees the
      // whole sky, a wall sees half of it, a soffit sees almost none — and the
      // hemisphere light and the environment map together only account for a
      // fraction of that difference, so a platform's top and its side came out
      // within a few levels of each other. That is the defect: with the lip and
      // the ground beyond it both the same grey, there is nothing to say where
      // the surface ends. This puts a hard nineteen-percent step at every
      // horizontal-to-vertical corner in the game, which is the one edge cue
      // that costs nothing and works on every material at once.
      //
      // Up-facing is left at exactly 1.0 on purpose: every surface tone in this
      // file was measured on a floor, and those must not move.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix( 0.6, 1.0, smoothstep( -0.6, 0.55, vSurfNormal.y ) );`,
      );
    }

    if (macro) {
      shader.uniforms.macroMap = { value: getMacroMap(macro.kind) };
      shader.uniforms.macroScale = { value: 1 / macro.span };
      shader.uniforms.macroStrength = { value: macro.strength };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'varying vec3 vSurfNormal;',
          `varying vec3 vSurfNormal;
          uniform sampler2D macroMap;
          uniform float macroScale;
          uniform float macroStrength;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          // Projected on whichever world plane the face most faces, so a deck
          // and the kerb beside it weather as one surface.
          vec3 mn = abs( vSurfNormal );
          vec2 macroUv = mn.y > max( mn.x, mn.z )
            ? vSurfPos.xz
            : ( mn.x > mn.z ? vSurfPos.zy : vSurfPos.xy );
          vec3 macro = texture2D( macroMap, macroUv * macroScale ).rgb;
          diffuseColor.rgb *= mix( vec3( 1.0 ), macro * 2.0, macroStrength );`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          // Where the macro darkens — a drainage fall, a damp streak — the
          // surface also goes glossier, which is what sells it as wet stone
          // rather than as a stain painted on.
          roughnessFactor *= mix( 1.0, 0.55 + macro.g, macroStrength * 0.6 );`,
        );
    }

    if (water) {
      shader.uniforms.horizonColor = { value: horizonColor.clone() };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'varying vec3 vSurfNormal;',
          'varying vec3 vSurfNormal;\nuniform vec3 horizonColor;',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          // Fresnel. Water seen from above is dark and shows its own colour;
          // seen at a grazing angle it is a mirror of the sky. That gradient
          // from dark underfoot to bright at the far bank is the strongest cue
          // there is that a surface is lying flat rather than standing up, and
          // it is what a plain tiled plane can never have. Taken against world
          // up rather than the rippled normal, so the ramp stays smooth and
          // the ripples only break the highlight.
          float grazing = pow( 1.0 - clamp( normalize( cameraPosition - vSurfPos ).y, 0.0, 1.0 ), 3.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, horizonColor, 0.12 + grazing * 0.7 );`,
        );
    }

    if (backdrop) {
      shader.uniforms.backdropNear = { value: backdropFog.near };
      shader.uniforms.backdropFar = { value: backdropFog.far };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'varying vec3 vSurfNormal;',
          'varying vec3 vSurfNormal;\nuniform float backdropNear;\nuniform float backdropFar;',
        )
        .replace(
          '#include <fog_fragment>',
          `#ifdef USE_FOG
            float bfog = smoothstep( backdropNear, backdropFar, vFogDepth );
            // Haze lies in the valley, so a tower's foot sinks into the
            // horizon while its crown keeps its value. That gradient up the
            // face is most of what makes distance read as distance.
            bfog *= mix( 1.0, 0.5, clamp( vSurfPos.y / 60.0, 0.0, 1.0 ) );
            gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, bfog );
          #endif`,
        );
    }
  };
  // Without this every extended material would share one compiled program.
  mat.customProgramCacheKey = () => key;
}

export function buildBlocks(blocks: Block[]): BuiltGeometry {
  const collision = new CollisionMesh();

  const prepare = (b: Block, backdrop: boolean): Prepared => {
    const geo = blockGeometry(b);
    applyUvScale(geo, b);
    // Non-indexed everywhere so collision extraction and merging stay simple.
    const solid = geo.index ? geo.toNonIndexed() : geo;
    solid.applyMatrix4(transformOf(b));
    solid.computeVertexNormals();
    solid.computeBoundingBox();
    if (!b.noCollide) {
      const surface = SURFACES[b.surface ?? 'default'] ?? SURFACES.default;
      collision.addTriangles(solid.getAttribute('position').array as Float32Array, surface);
    }
    return {
      geo: solid,
      bounds: solid.boundingBox!.clone(),
      texture: b.texture ?? DEFAULT_TEXTURE,
      color: b.color,
      backdrop,
    };
  };

  const prepared = blocks.map((b) => prepare(b, false));

  // Everything the marble can touch, plus the box that contains all of it: the
  // union is a cheap early-out for the towers and river planes that are miles
  // outside it, so the per-block search only runs for the near misses.
  const solidBounds: THREE.Box3[] = [];
  const playable = new THREE.Box3();
  blocks.forEach((b, i) => {
    if (b.noCollide) return;
    solidBounds.push(prepared[i].bounds);
    playable.union(prepared[i].bounds);
  });

  const isBackdrop = (bounds: THREE.Box3) => {
    if (!solidBounds.length) return false;
    if (boxDistance(bounds, playable) > BACKDROP_STANDOFF) return true;
    for (const s of solidBounds) {
      if (boxDistance(bounds, s) <= BACKDROP_STANDOFF) return false;
    }
    return true;
  };

  const extra: Prepared[] = [];
  blocks.forEach((b, i) => {
    if (!b.noCollide) return;
    if (!isBackdrop(prepared[i].bounds)) return;
    prepared[i].backdrop = true;
    if (b.kind === 'box') {
      for (const c of skylineCrown(b as BoxBlock)) extra.push(prepare(c, true));
    }
  });
  prepared.push(...extra);

  const byKey = new Map<string, { geos: THREE.BufferGeometry[]; item: Prepared }>();
  for (const p of prepared) {
    const key = `${p.texture}|${p.color ?? ''}|${p.backdrop ? 'bg' : 'fg'}`;
    let bucket = byKey.get(key);
    if (!bucket) byKey.set(key, (bucket = { geos: [], item: p }));
    bucket.geos.push(p.geo);
  }

  const meshes: THREE.Mesh[] = [];
  for (const [key, bucket] of byKey) {
    const { texture, color: tintColor, backdrop } = bucket.item;
    const merged = mergeGeometries(bucket.geos);
    // Repeat is baked into the UVs, so the texture itself repeats 1:1.
    const look = LOOK[texture] ?? DEFAULT_LOOK;
    const color = new THREE.Color(tintColor ?? 0xffffff);
    if (look.tint) color.multiplyScalar(look.tint);
    const normalMap = getNormalMap(texture);
    const mat = new THREE.MeshStandardMaterial({
      map: getTexture(texture),
      normalMap,
      color,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: look.env ?? 0.55,
    });
    if (normalMap) mat.normalScale.setScalar(look.normalScale ?? 1);
    extendMaterial(mat, MACRO[texture], backdrop, texture === 'water', key);
    const mesh = new THREE.Mesh(merged, mat);
    // Backdrop never reaches the shadow frustum, so it only costs a pass.
    mesh.castShadow = !backdrop;
    mesh.receiveShadow = !backdrop;
    meshes.push(mesh);
    for (const g of bucket.geos) g.dispose();
  }

  collision.build();
  return { meshes, collision };
}
