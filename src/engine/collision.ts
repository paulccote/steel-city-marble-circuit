import * as THREE from 'three';
import type { CollisionQuery, Contact, SurfaceMaterial } from './physics';
import { DEFAULT_MATERIAL } from './physics';

/**
 * Static triangle soup with a uniform-grid broadphase, plus a small set of
 * moving colliders for platforms. Levels are mostly static, so the grid is
 * built once and queried per physics tick.
 */

const EPS = 1e-6;

/** Closest point on triangle ABC to P. Ericson, Real-Time Collision Detection. */
export function closestPointOnTriangle(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ab = _t1.subVectors(b, a);
  const ac = _t2.subVectors(c, a);
  const ap = _t3.subVectors(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  const bp = _t4.subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(ab, v);
  }

  const cp = _t4.subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return out.copy(b).addScaledVector(_t3.subVectors(c, b), w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _t3 = new THREE.Vector3();
const _t4 = new THREE.Vector3();

/** Earliest root of at^2+bt+c in [0,1], or -1. */
function quadratic(a: number, b: number, c: number): number {
  if (Math.abs(a) < EPS) {
    if (Math.abs(b) < EPS) return -1;
    const t = -c / b;
    return t >= 0 && t <= 1 ? t : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  return -1;
}

/** Sweep a sphere of `r` from `from` along `d` against a vertex at `v`. */
function sweepVertex(from: THREE.Vector3, d: THREE.Vector3, r: number, v: THREE.Vector3): number {
  const m = _s1.subVectors(from, v);
  return quadratic(d.dot(d), 2 * m.dot(d), m.dot(m) - r * r);
}

/** Sweep against the infinite cylinder around segment ab, clipped to it. */
function sweepEdge(
  from: THREE.Vector3,
  d: THREE.Vector3,
  r: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
): number {
  const ab = _s2.subVectors(b, a);
  const ao = _s3.subVectors(from, a);
  const abLenSq = ab.dot(ab);
  if (abLenSq < EPS) return sweepVertex(from, d, r, a);

  const dDotAb = d.dot(ab);
  const aoDotAb = ao.dot(ab);

  // Components perpendicular to the edge.
  const dPerp = _s4.copy(d).addScaledVector(ab, -dDotAb / abLenSq);
  const aoPerp = _s5.copy(ao).addScaledVector(ab, -aoDotAb / abLenSq);

  const t = quadratic(dPerp.dot(dPerp), 2 * aoPerp.dot(dPerp), aoPerp.dot(aoPerp) - r * r);
  if (t < 0) return -1;

  // Reject if the closest point falls off the end of the segment; the vertex
  // sweep covers those cases.
  const along = (aoDotAb + t * dDotAb) / abLenSq;
  return along >= 0 && along <= 1 ? t : -1;
}

const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const _s4 = new THREE.Vector3();
const _s5 = new THREE.Vector3();
const _s6 = new THREE.Vector3();
const _s7 = new THREE.Vector3();

export interface TriangleRef {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normal: THREE.Vector3;
  material: SurfaceMaterial;
}

export class CollisionMesh {
  tris: TriangleRef[] = [];
  private grid = new Map<number, number[]>();
  private cell = 2;
  private min = new THREE.Vector3(Infinity, Infinity, Infinity);

  /**
   * @param positions flat xyz triples, three vertices per triangle
   * @param material  surface material for every triangle added in this call
   */
  addTriangles(positions: ArrayLike<number>, material: SurfaceMaterial = DEFAULT_MATERIAL) {
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
      const normal = new THREE.Vector3()
        .subVectors(b, a)
        .cross(_t1.subVectors(c, a));
      const len = normal.length();
      if (len < EPS) continue; // degenerate
      normal.divideScalar(len);
      this.tris.push({ a, b, c, normal, material });
    }
  }

  addMesh(mesh: THREE.Mesh, material: SurfaceMaterial = DEFAULT_MATERIAL) {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geo.getAttribute('position');
    const arr: number[] = [];
    const v = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
      arr.push(v.x, v.y, v.z);
    }
    this.addTriangles(arr, material);
  }

  /** Must be called after all triangles are added. */
  build(cellSize = 2) {
    this.cell = cellSize;
    this.grid.clear();
    this.min.set(Infinity, Infinity, Infinity);
    for (const t of this.tris) {
      this.min.min(t.a).min(t.b).min(t.c);
    }
    if (!isFinite(this.min.x)) this.min.set(0, 0, 0);

    for (let i = 0; i < this.tris.length; i++) {
      const t = this.tris[i];
      const lo = _s1.copy(t.a).min(t.b).min(t.c);
      const hi = _s2.copy(t.a).max(t.b).max(t.c);
      this.forEachCell(lo, hi, (key) => {
        let bucket = this.grid.get(key);
        if (!bucket) this.grid.set(key, (bucket = []));
        bucket.push(i);
      });
    }
  }

  private hash(x: number, y: number, z: number) {
    // 21 bits per axis, offset to keep negatives positive.
    return ((x + 1048576) * 2097152 + (y + 1048576)) * 2097152 + (z + 1048576);
  }

  private forEachCell(lo: THREE.Vector3, hi: THREE.Vector3, fn: (key: number) => void) {
    const c = this.cell;
    const x0 = Math.floor((lo.x - this.min.x) / c);
    const y0 = Math.floor((lo.y - this.min.y) / c);
    const z0 = Math.floor((lo.z - this.min.z) / c);
    const x1 = Math.floor((hi.x - this.min.x) / c);
    const y1 = Math.floor((hi.y - this.min.y) / c);
    const z1 = Math.floor((hi.z - this.min.z) / c);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) fn(this.hash(x, y, z));
  }

  /** Collect unique triangle indices whose cells overlap the box. */
  query(lo: THREE.Vector3, hi: THREE.Vector3, out: number[], seen: Set<number>) {
    out.length = 0;
    seen.clear();
    this.forEachCell(lo, hi, (key) => {
      const bucket = this.grid.get(key);
      if (!bucket) return;
      for (const i of bucket) {
        if (!seen.has(i)) {
          seen.add(i);
          out.push(i);
        }
      }
    });
  }
}

/** A collider that moves: elevators, platforms, spinning hazards. */
export interface MovingCollider {
  mesh: CollisionMesh;
  /** Local -> world. Updated by gameplay before each physics tick. */
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
  /** World-space linear velocity of the body. */
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  origin: THREE.Vector3;
  enabled: boolean;
}

export class CollisionWorld implements CollisionQuery {
  readonly statics = new CollisionMesh();
  readonly movers: MovingCollider[] = [];

  private candidates: number[] = [];
  private seen = new Set<number>();
  private lo = new THREE.Vector3();
  private hi = new THREE.Vector3();
  private closest = new THREE.Vector3();
  private localPos = new THREE.Vector3();

  build() {
    this.statics.build();
  }

  addMover(mesh: CollisionMesh): MovingCollider {
    mesh.build();
    const m: MovingCollider = {
      mesh,
      matrix: new THREE.Matrix4(),
      inverse: new THREE.Matrix4(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      enabled: true,
    };
    this.movers.push(m);
    return m;
  }

  contacts(pos: THREE.Vector3, radius: number, out: Contact[]) {
    out.length = 0;
    // A small skin keeps resting contact alive between ticks; without it the
    // marble alternates between touching and falling and buzzes on flat ground.
    const skin = 0.02;
    const r = radius + skin;

    this.collectFrom(this.statics, pos, r, radius, out, null);

    for (const mover of this.movers) {
      if (!mover.enabled) continue;
      this.localPos.copy(pos).applyMatrix4(mover.inverse);
      this.collectFrom(mover.mesh, this.localPos, r, radius, out, mover);
    }
  }

  private collectFrom(
    mesh: CollisionMesh,
    pos: THREE.Vector3,
    queryRadius: number,
    radius: number,
    out: Contact[],
    mover: MovingCollider | null,
  ) {
    this.lo.set(pos.x - queryRadius, pos.y - queryRadius, pos.z - queryRadius);
    this.hi.set(pos.x + queryRadius, pos.y + queryRadius, pos.z + queryRadius);
    mesh.query(this.lo, this.hi, this.candidates, this.seen);

    for (const i of this.candidates) {
      const t = mesh.tris[i];
      closestPointOnTriangle(pos, t.a, t.b, t.c, this.closest);
      const delta = _s6.subVectors(pos, this.closest);
      const distSq = delta.lengthSq();
      if (distSq > queryRadius * queryRadius) continue;

      const dist = Math.sqrt(distSq);
      const normal = new THREE.Vector3();
      if (dist > EPS) {
        normal.copy(delta).divideScalar(dist);
        // On edges and vertices the delta is the true normal, but on a face
        // hit it can flip if we are fractionally behind the plane; trust the
        // face normal when they disagree badly.
        if (normal.dot(t.normal) < 0 && dist < radius * 0.5) normal.copy(t.normal);
      } else {
        normal.copy(t.normal);
      }

      const point = new THREE.Vector3().copy(this.closest);
      const surfaceVelocity = new THREE.Vector3();

      if (mover) {
        normal.transformDirection(mover.matrix).normalize();
        point.applyMatrix4(mover.matrix);
        surfaceVelocity
          .copy(mover.angularVelocity)
          .cross(_s7.subVectors(point, mover.origin))
          .add(mover.velocity);
      }

      out.push({
        normal,
        point,
        depth: Math.max(0, radius - dist),
        material: t.material,
        surfaceVelocity,
      });
    }
  }

  sweep(from: THREE.Vector3, delta: THREE.Vector3, radius: number): number {
    let best = -1;

    const consider = (t: number) => {
      if (t >= 0 && (best < 0 || t < best)) best = t;
    };

    const run = (mesh: CollisionMesh, origin: THREE.Vector3, d: THREE.Vector3) => {
      this.lo.copy(origin).min(_s1.copy(origin).add(d)).subScalar(radius);
      this.hi.copy(origin).max(_s1.copy(origin).add(d)).addScalar(radius);
      mesh.query(this.lo, this.hi, this.candidates, this.seen);

      for (const i of this.candidates) {
        const t = mesh.tris[i];
        const denom = d.dot(t.normal);
        const dist = _s1.subVectors(origin, t.a).dot(t.normal);

        // Face hit: solve for the moment the sphere's plane distance == radius.
        if (denom < -EPS) {
          const tHit = (radius - dist) / denom;
          if (tHit >= 0 && tHit <= 1) {
            const p = _s2.copy(origin).addScaledVector(d, tHit).addScaledVector(t.normal, -radius);
            closestPointOnTriangle(p, t.a, t.b, t.c, this.closest);
            if (this.closest.distanceToSquared(p) < EPS * 10) {
              consider(tHit);
              continue;
            }
          }
        }

        // Otherwise the sphere may still catch an edge or a corner.
        consider(sweepEdge(origin, d, radius, t.a, t.b));
        consider(sweepEdge(origin, d, radius, t.b, t.c));
        consider(sweepEdge(origin, d, radius, t.c, t.a));
        consider(sweepVertex(origin, d, radius, t.a));
        consider(sweepVertex(origin, d, radius, t.b));
        consider(sweepVertex(origin, d, radius, t.c));
      }
    };

    run(this.statics, from, delta);

    for (const mover of this.movers) {
      if (!mover.enabled) continue;
      // Sweep in the mover's frame. Good enough while the platform is slower
      // than the marble, which holds for every platform we ship.
      const origin = _s3.copy(from).applyMatrix4(mover.inverse);
      const end = _s4.copy(from).add(delta).applyMatrix4(mover.inverse);
      run(mover.mesh, origin, _s5.subVectors(end, origin));
    }

    return best;
  }
}
