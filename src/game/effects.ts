import * as THREE from 'three';
import type { Marble } from '../engine/physics';
import type { PowerupType } from './types';

/**
 * A single pooled particle system for every effect in the game. One draw call
 * for sparks, dust, explosions and the speed trail keeps the cost invisible
 * next to the scene geometry.
 *
 * Every particle carries a start and end colour, a start and end size, gravity
 * and drag. That is enough to express a spark (fast, shrinking, orange to red,
 * heavy gravity), smoke (slow, growing, rising, dimming) and a pop (outward,
 * huge drag, white to hue) from the same update loop and the same draw call.
 *
 * `update()` allocates nothing: all vector maths uses preallocated scratch and
 * every spawn path takes scalars rather than Vector3s.
 */

const MAX_PARTICLES = 2200;

const WHITE = new THREE.Color(0xffffff);

interface Particle {
  life: number;
  invMaxLife: number;
  vel: THREE.Vector3;
  gravity: number;
  /** Per-second velocity damping. High drag is what makes a burst read as a
   *  "pop" rather than as a slow expanding cloud. */
  drag: number;
  size0: number;
  size1: number;
  r0: number;
  g0: number;
  b0: number;
  r1: number;
  g1: number;
  b1: number;
}

/** How a surface answers a marble scrubbing across it. */
interface ContactLook {
  /** Bright hot colour at birth. */
  c0: number;
  /** What it decays to; additive blending means dark = faded. */
  c1: number;
  size0: number;
  size1: number;
  life: number;
  gravity: number;
  drag: number;
  /** Sideways spread in m/s. */
  spread: number;
  /** Push along the surface normal, so dust lifts and sparks skim. */
  lift: number;
  /** Fraction of the marble's velocity the particle inherits, backwards.
   *  Sparks fly off along the contact; dust is left behind. */
  fling: number;
  /** Particles per second at full scrub. */
  rate: number;
  /** Slip speed at which this surface starts emitting at all. */
  threshold: number;
}

const DEFAULT_CONTACT: ContactLook = {
  c0: 0xe8e0cf,
  c1: 0x2a2620,
  size0: 0.05,
  size1: 0.11,
  life: 0.45,
  gravity: -1.5,
  drag: 2.2,
  spread: 1.1,
  lift: 0.7,
  fling: 0.08,
  rate: 26,
  threshold: 2.5,
};

const look = (p: Partial<ContactLook>): ContactLook => ({ ...DEFAULT_CONTACT, ...p });

/**
 * Keyed by `SurfaceMaterial.kind`. The rule of thumb: hard surfaces throw
 * small fast particles, soft surfaces throw large slow ones, and anything
 * that glows starts near-white so the additive blend gives it a hot core.
 */
const CONTACT_LOOKS: Record<string, ContactLook> = {
  default: DEFAULT_CONTACT,

  // Dust: pale, grows as it disperses, barely falls.
  tarmac: look({ c0: 0xd9d2c4, c1: 0x241f1a, size0: 0.05, size1: 0.13, gravity: -1.2 }),
  cobblestone: look({ c0: 0xcfc7b6, c1: 0x231f19, size0: 0.055, size1: 0.14, rate: 32 }),

  // Sparks: tiny, very fast, fall hard, cool from white through orange to red.
  steel: look({
    c0: 0xfff2c0,
    c1: 0x8c1400,
    size0: 0.045,
    size1: 0.008,
    life: 0.4,
    gravity: -11,
    drag: 0.6,
    spread: 2.6,
    lift: 0.5,
    fling: 0.55,
    rate: 60,
    threshold: 5,
  }),

  // Snow puff: white, floaty, almost no gravity, disperses wide.
  ice: look({
    c0: 0xf2fbff,
    c1: 0x16303f,
    size0: 0.045,
    size1: 0.12,
    life: 0.7,
    gravity: -0.35,
    drag: 3.2,
    spread: 1.4,
    lift: 0.5,
    fling: 0.12,
    rate: 34,
    threshold: 3.5,
  }),

  // Torn grass: green flecks with real weight, thrown backwards.
  grass: look({
    c0: 0x9ee06a,
    c1: 0x12300c,
    size0: 0.05,
    size1: 0.03,
    life: 0.6,
    gravity: -7,
    drag: 1.2,
    spread: 1.6,
    lift: 1.1,
    fling: 0.3,
    rate: 30,
  }),

  sand: look({ c0: 0xe6cf9a, c1: 0x2e2412, size0: 0.06, size1: 0.15, gravity: -2.5, rate: 34 }),
  carpet: look({ c0: 0xb0a08c, c1: 0x1c1712, size0: 0.045, size1: 0.09, rate: 16, gravity: -1 }),

  // Spray: blue-white droplets on a real arc, splitting sideways.
  water: look({
    c0: 0xdff4ff,
    c1: 0x0a2c46,
    size0: 0.05,
    size1: 0.02,
    life: 0.55,
    gravity: -9,
    drag: 0.8,
    spread: 2.2,
    lift: 1.6,
    fling: 0.35,
    rate: 55,
    threshold: 1.5,
  }),

  // Rubber and low-friction plastics: faint scuff smoke, nothing bright.
  slick: look({ c0: 0xb9c4cc, c1: 0x1a2026, size0: 0.04, size1: 0.1, rate: 16, threshold: 4 }),
  lowFriction: look({ c0: 0xb9c4cc, c1: 0x1a2026, size0: 0.04, size1: 0.1, rate: 16, threshold: 4 }),
  highFriction: look({ c0: 0x8f8a86, c1: 0x151312, size0: 0.05, size1: 0.13, rate: 22, threshold: 4 }),
  rampYellow: look({ c0: 0xdcc25a, c1: 0x2a2109, size0: 0.05, size1: 0.12, rate: 22, threshold: 4 }),
  bounceFloor: look({ c0: 0x9a86c8, c1: 0x160f26, size0: 0.045, size1: 0.11, rate: 18, threshold: 4 }),
};

/** Matches POWERUP_COLORS in level.ts so the burst reads as the same object. */
const POWERUP_LOOK: Record<PowerupType, { core: number; edge: number }> = {
  superSpeed: { core: 0xffd8b0, edge: 0xff5a2b },
  superJump: { core: 0xd6f4ff, edge: 0x39c7ff },
  superBounce: { core: 0xf0d8ff, edge: 0xc65cff },
  shockAbsorber: { core: 0xe6ecf1, edge: 0x9aa4ad },
  gyrocopter: { core: 0xd4ffe6, edge: 0x4de08a },
  megaMarble: { core: 0xfff3c4, edge: 0xffd23f },
};

export class Effects {
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: Particle[] = [];
  private cursor = 0;

  // Scratch. Nothing in update() may allocate.
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tan = new THREE.Vector3();
  private bitan = new THREE.Vector3();
  private prevPos = new THREE.Vector3();
  private hasPrev = false;
  private col = new THREE.Color();
  private col2 = new THREE.Color();

  private trailDistance = 0;
  private contactCarry = 0;
  private viewportHeight = 0;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        life: 0,
        invMaxLife: 1,
        vel: new THREE.Vector3(),
        gravity: 0,
        drag: 0,
        size0: 1,
        size1: 0,
        r0: 1,
        g0: 1,
        b0: 1,
        r1: 0,
        g1: 0,
        b1: 0,
      });
      // Park dead particles far away rather than branching in the shader.
      this.positions[i * 3 + 1] = -9999;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.sizes, 1));

    this.viewportHeight = window.innerHeight;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: this.viewportHeight / 2 } },
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(-mv.z, 0.001);
          gl_Position = projectionMatrix * mv;
        }`,
      // A hot core with a soft shoulder rather than a flat disc: under
      // additive blending it is what makes overlapping sparks look like fire
      // instead of like a sheet of orange.
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          float a = pow(1.0 - r, 1.6);
          float core = pow(max(0.0, 1.0 - r * 1.8), 4.0);
          gl_FragColor = vec4(vColor * (1.0 + core * 1.5), a);
        }`,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // --------------------------------------------------------------- spawning

  /**
   * Scalar arguments throughout: this is called up to a couple of hundred
   * times per explosion and must not build Vector3s to do it.
   */
  private spawn(
    px: number,
    py: number,
    pz: number,
    vx: number,
    vy: number,
    vz: number,
    r0: number,
    g0: number,
    b0: number,
    r1: number,
    g1: number,
    b1: number,
    life: number,
    size0: number,
    size1: number,
    gravity: number,
    drag: number,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const p = this.particles[i];
    p.life = life;
    p.invMaxLife = 1 / life;
    p.vel.set(vx, vy, vz);
    p.gravity = gravity;
    p.drag = drag;
    p.size0 = size0;
    p.size1 = size1;
    p.r0 = r0;
    p.g0 = g0;
    p.b0 = b0;
    p.r1 = r1;
    p.g1 = g1;
    p.b1 = b1;
    const o = i * 3;
    this.positions[o] = px;
    this.positions[o + 1] = py;
    this.positions[o + 2] = pz;
    this.colors[o] = r0;
    this.colors[o + 1] = g0;
    this.colors[o + 2] = b0;
    this.sizes[i] = size0;
  }

  /** Vector3-flavoured wrapper for the one-shot effects, which are event
   *  driven and can afford the convenience. */
  private emit(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    c0: THREE.Color,
    c1: THREE.Color,
    life: number,
    size0: number,
    size1: number,
    gravity: number,
    drag: number,
  ) {
    this.spawn(
      pos.x, pos.y, pos.z,
      vel.x, vel.y, vel.z,
      c0.r, c0.g, c0.b,
      c1.r, c1.g, c1.b,
      life, size0, size1, gravity, drag,
    );
  }

  /** Uniform point on the unit sphere, written into `out`. */
  private randomDir(out: THREE.Vector3) {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return out.set(Math.cos(a) * r, z, Math.sin(a) * r);
  }

  /** An orthonormal pair spanning the plane perpendicular to `n`. */
  private basis(n: THREE.Vector3) {
    // Cross with whichever axis n is least aligned to, so the cross never
    // degenerates on a vertical or horizontal normal.
    this.tan.set(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0);
    this.tan.crossVectors(this.tan, n).normalize();
    this.bitan.crossVectors(n, this.tan).normalize();
  }

  // ------------------------------------------------------------- public FX

  /**
   * Landing burst, keyed to the surface. `speed` is `Marble.impactSpeed`, so a
   * scraping touchdown puffs and a full-height drop throws a real cloud.
   */
  impact(pos: THREE.Vector3, normal: THREE.Vector3, speed = 8, kind = 'default') {
    const L = CONTACT_LOOKS[kind] ?? DEFAULT_CONTACT;
    // Same 2.5..12 m/s window the audio uses, so the eye and the ear agree.
    const v = Math.min(1, Math.max(0, (speed - 2.5) / 9.5));
    if (v <= 0.02) return;
    const n = Math.round(6 + v * 26);
    this.col.setHex(L.c0);
    this.col2.setHex(L.c1);
    this.basis(normal);

    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.6;
      this.tmp
        .copy(this.tan)
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(this.bitan, Math.sin(a) * r)
        .multiplyScalar(L.spread * (1 + v * 2.2))
        .addScaledVector(normal, L.lift * (0.6 + Math.random() * 1.4) * (1 + v));
      this.tmp2.copy(pos).addScaledVector(normal, -0.02);
      this.emit(
        this.tmp2,
        this.tmp,
        this.col,
        this.col2,
        L.life * (0.7 + Math.random() * 0.6),
        L.size0 * (0.8 + v * 0.7),
        L.size1,
        L.gravity,
        L.drag,
      );
    }

    // A dim ground flash on genuinely hard landings, to sell the weight.
    if (v > 0.5) {
      this.emit(pos, this.tmp.set(0, 0, 0), this.col, this.col2, 0.1, 0.35 * v, 0.02, 0, 0);
    }
  }

  /** Kept for the existing call site; a landing with no surface information. */
  burst(pos: THREE.Vector3, normal: THREE.Vector3) {
    this.impact(pos, normal, 8, 'default');
  }

  /**
   * Gem collection. A hard outward ring with heavy drag reads as a *pop*: the
   * particles snap out and stop, rather than drifting away like a fizzle.
   */
  gemPop(pos: THREE.Vector3, hex = 0xff4fd8) {
    this.col.setHex(0xffffff);
    this.col2.setHex(hex);

    // Flash core.
    this.emit(pos, this.tmp.set(0, 0, 0), this.col, this.col2, 0.12, 0.45, 0.05, 0, 0);

    // The ring: flattened onto the horizontal plane so it reads as a shockwave.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const s = 5.5 + Math.random() * 2.5;
      this.tmp.set(Math.cos(a) * s, (Math.random() - 0.3) * 1.6, Math.sin(a) * s);
      this.emit(pos, this.tmp, this.col, this.col2, 0.3 + Math.random() * 0.15, 0.11, 0.01, -1, 7);
    }

    // Lingering glitter that falls, so the pop leaves something behind.
    this.col2.setHex(hex).multiplyScalar(0.15);
    this.col.setHex(hex).lerp(WHITE, 0.5);
    for (let i = 0; i < 14; i++) {
      this.randomDir(this.tmp).multiplyScalar(1.2 + Math.random() * 2.4);
      this.tmp.y = Math.abs(this.tmp.y) + 1.5;
      this.emit(pos, this.tmp, this.col, this.col2, 0.55 + Math.random() * 0.4, 0.06, 0.015, -7, 0.6);
    }
  }

  /** Generic coloured burst; the old name, still used for bumpers and finish. */
  sparkle(pos: THREE.Vector3, hex: number) {
    this.gemPop(pos, hex);
  }

  /** Time travel: a cold implosion rather than a burst — particles fall in. */
  timeTravel(pos: THREE.Vector3, hex = 0x66ddff) {
    this.col.setHex(0xffffff);
    this.col2.setHex(hex);
    this.emit(pos, this.tmp.set(0, 0, 0), this.col, this.col2, 0.18, 0.5, 0.05, 0, 0);
    for (let i = 0; i < 30; i++) {
      // Start out on a shell and travel inwards: drag brakes them at the
      // centre, which looks like time folding up.
      this.randomDir(this.tmp2).multiplyScalar(1.6);
      this.tmp.copy(this.tmp2).multiplyScalar(-4.5);
      this.tmp2.add(pos);
      this.emit(this.tmp2, this.tmp, this.col2, this.col, 0.45, 0.07, 0.02, 0, 3);
    }
  }

  /** Bumper: a flat orange shock ring flung along the launch plane. */
  bumper(pos: THREE.Vector3, hex = 0xffaa33) {
    this.col.setHex(0xfff0d0);
    this.col2.setHex(hex).multiplyScalar(0.1);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const s = 7 + Math.random() * 3;
      this.tmp.set(Math.cos(a) * s, 0.6 + Math.random() * 1.2, Math.sin(a) * s);
      this.emit(pos, this.tmp, this.col, this.col2, 0.35, 0.13, 0.02, -3, 5);
    }
    this.emit(pos, this.tmp.set(0, 0, 0), WHITE, this.col2, 0.1, 0.5, 0.05, 0, 0);
  }

  /**
   * Powerup activation, in the powerup's own colours: a ground ring plus a
   * rising column, so each pickup is identifiable from the effect alone.
   */
  powerupBurst(pos: THREE.Vector3, type: PowerupType | null) {
    const l = (type && POWERUP_LOOK[type]) || { core: 0xfff3c4, edge: 0xffe066 };
    this.col.setHex(l.core);
    this.col2.setHex(l.edge);

    this.emit(pos, this.tmp.set(0, 0, 0), WHITE, this.col2, 0.14, 0.55, 0.05, 0, 0);

    // Ring at the marble's feet.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const s = 4.5 + Math.random() * 1.5;
      this.tmp.set(Math.cos(a) * s, 0.3, Math.sin(a) * s);
      this.tmp2.copy(pos).setY(pos.y - 0.15);
      this.emit(this.tmp2, this.tmp, this.col, this.col2, 0.4, 0.1, 0.015, -1, 5);
    }

    // Rising helix, which is what makes it read as "empowered" rather than
    // "exploded": the particles go up and stay up.
    this.col2.setHex(l.edge).multiplyScalar(0.12);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 6;
      const r = 0.9 + Math.random() * 0.6;
      this.tmp.set(Math.cos(a) * r, 3.2 + Math.random() * 3.4, Math.sin(a) * r);
      this.tmp2.copy(pos).setY(pos.y - 0.2);
      this.emit(this.tmp2, this.tmp, this.col, this.col2, 0.55 + Math.random() * 0.3, 0.09, 0.02, -2.5, 1.2);
    }
  }

  /**
   * Mine detonation, in four layers: flash, fireball, embers and smoke, plus a
   * ground shock ring. A single colour of dots does not read as an explosion;
   * the colour *travel* from white through orange to soot is what does.
   */
  explosion(pos: THREE.Vector3) {
    // 1. Flash — a few big, near-stationary, blown-out points.
    this.col.setHex(0xffffff);
    this.col2.setHex(0xffc36a);
    for (let i = 0; i < 8; i++) {
      this.randomDir(this.tmp).multiplyScalar(1.2);
      this.emit(pos, this.tmp, this.col, this.col2, 0.09 + Math.random() * 0.05, 0.7, 0.1, 0, 0);
    }

    // 2. Fireball — grows and cools as it expands, braked by drag.
    this.col.setHex(0xffe6a0);
    this.col2.setHex(0x501000);
    for (let i = 0; i < 52; i++) {
      const s = 3 + Math.random() * 9;
      this.randomDir(this.tmp).multiplyScalar(s);
      this.tmp.y = this.tmp.y * 0.7 + 1.5;
      this.emit(pos, this.tmp, this.col, this.col2, 0.35 + Math.random() * 0.4, 0.16, 0.34, -2, 2.6);
    }

    // 3. Embers — small, fast, heavy, and long-lived enough to arc and fall.
    this.col.setHex(0xfff0b0);
    this.col2.setHex(0x9a1a00);
    for (let i = 0; i < 46; i++) {
      const s = 6 + Math.random() * 16;
      this.randomDir(this.tmp).multiplyScalar(s);
      this.tmp.y = Math.abs(this.tmp.y) * 0.8 + 2;
      this.emit(pos, this.tmp, this.col, this.col2, 0.6 + Math.random() * 0.7, 0.055, 0.012, -13, 0.35);
    }

    // 4. Smoke — dim warm grey that rises and spreads. Additive blending means
    // it can only add light, so it is kept dark enough to read as haze.
    this.col.setHex(0x3a3128);
    this.col2.setHex(0x070605);
    for (let i = 0; i < 24; i++) {
      this.randomDir(this.tmp).multiplyScalar(1.6 + Math.random() * 2);
      this.tmp.y = Math.abs(this.tmp.y) + 1.2;
      this.emit(pos, this.tmp, this.col, this.col2, 1.1 + Math.random() * 0.6, 0.2, 0.75, 0.8, 1.4);
    }

    // 5. Ground shock ring, flat and fast, gone in a third of a second.
    this.col.setHex(0xffd9a0);
    this.col2.setHex(0x2a0a00);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const s = 11 + Math.random() * 4;
      this.tmp.set(Math.cos(a) * s, 0.2, Math.sin(a) * s);
      this.emit(pos, this.tmp, this.col, this.col2, 0.32, 0.14, 0.02, -1, 6);
    }
  }

  /** Finish: a tall celebratory fountain rather than a one-frame sparkle. */
  finishBurst(pos: THREE.Vector3, hex = 0x66ff99) {
    this.col.setHex(0xffffff);
    this.col2.setHex(hex).multiplyScalar(0.1);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      this.tmp.set(Math.cos(a) * r, 6 + Math.random() * 7, Math.sin(a) * r);
      this.emit(pos, this.tmp, this.col, this.col2, 0.9 + Math.random() * 0.8, 0.08, 0.02, -9, 0.3);
    }
    this.gemPop(pos, hex);
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, marble: Marble) {
    // Point size is in world units scaled by viewport height; without this the
    // particles would silently change size after a window resize.
    if (window.innerHeight !== this.viewportHeight) {
      this.viewportHeight = window.innerHeight;
      (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = this.viewportHeight / 2;
    }

    this.emitTrail(dt, marble);
    this.emitContact(dt, marble);
    this.integrate(dt);

    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * The speed trail. Emitted per metre travelled rather than per frame, and
   * interpolated along the path since the last update, so it is a continuous
   * ribbon at 30 fps and at 144 fps alike — and so a teleport or respawn does
   * not draw a streak across the level.
   */
  private emitTrail(dt: number, marble: Marble) {
    const speed = marble.velocity.length();
    if (!this.hasPrev) {
      this.prevPos.copy(marble.position);
      this.hasPrev = true;
    }
    const moved = this.tmp.subVectors(marble.position, this.prevPos).length();

    // Marble Blast only shows a trail once you are genuinely fast; below that
    // it is decoration and it stops meaning "you are moving well".
    const heat = Math.min(1, Math.max(0, (speed - 9) / 11));
    // The second test rejects a respawn or teleport: without it the trail
    // would draw a straight streak across the level from the old position.
    if (heat > 0 && moved > 1e-5 && moved < Math.max(0.2, speed * dt * 4)) {
      // One puff every ~9 cm at full speed, sparser as it fades in.
      const spacing = 0.16 - heat * 0.07;
      this.trailDistance += moved;
      let guard = 0;
      while (this.trailDistance >= spacing && guard++ < 12) {
        this.trailDistance -= spacing;
        // Place the puff where the marble actually was when it earned it, so
        // the ribbon is even regardless of frame length.
        const f = Math.min(1, Math.max(0, (moved - this.trailDistance) / moved));
        this.tmp2.copy(this.prevPos).lerp(marble.position, f);
        // Hot core goes white as the marble approaches top speed; the tail
        // always fades to the same deep blue so the trail has a direction.
        this.col.setRGB(0.45 + heat * 0.55, 0.78 + heat * 0.22, 1);
        this.col2.setRGB(0.02, 0.06 + heat * 0.1, 0.2 + heat * 0.2);
        const jitter = marble.radius * 0.55;
        this.tmp.set(
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
          (Math.random() - 0.5) * jitter,
        );
        // Drift backwards along the path so the ribbon trails rather than
        // hangs, and drag settles it into place.
        this.tmp.addScaledVector(marble.velocity, -0.06);
        this.emit(
          this.tmp2,
          this.tmp,
          this.col,
          this.col2,
          0.24 + heat * 0.24,
          marble.radius * (0.5 + heat * 0.45),
          0.01,
          0,
          3.5,
        );
      }
    } else {
      this.trailDistance = 0;
    }
    this.prevPos.copy(marble.position);
  }

  /** Surface-appropriate particles while the marble scrubs across the ground. */
  private emitContact(dt: number, marble: Marble) {
    if (!marble.onGround) {
      this.contactCarry = 0;
      return;
    }
    const L = CONTACT_LOOKS[marble.lastContactMaterial.kind] ?? DEFAULT_CONTACT;
    const scrub = marble.slipSpeed - L.threshold;
    if (scrub <= 0) {
      this.contactCarry = 0;
      return;
    }
    const intensity = Math.min(1, scrub / 8);

    // Fractional emission carried between frames keeps the rate framerate
    // independent without allocating or bursting on a long frame.
    this.contactCarry += L.rate * intensity * dt;
    let count = Math.floor(this.contactCarry);
    if (count <= 0) return;
    this.contactCarry -= count;
    if (count > 8) count = 8;

    const n = marble.groundNormal;
    this.basis(n);
    this.col.setHex(L.c0);
    this.col2.setHex(L.c1);
    this.tmp2.copy(marble.position).addScaledVector(n, -marble.radius);

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.7;
      this.tmp
        .copy(this.tan)
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(this.bitan, Math.sin(a) * r)
        .multiplyScalar(L.spread * (0.5 + intensity))
        .addScaledVector(n, L.lift * (0.4 + Math.random()))
        .addScaledVector(marble.velocity, -L.fling);
      this.emit(
        this.tmp2,
        this.tmp,
        this.col,
        this.col2,
        L.life * (0.6 + Math.random() * 0.6) * (0.6 + intensity * 0.4),
        L.size0,
        L.size1,
        L.gravity,
        L.drag,
      );
    }
  }

  private integrate(dt: number) {
    const pos = this.positions;
    const col = this.colors;
    const sz = this.sizes;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      const o = i * 3;
      if (p.life <= 0) {
        pos[o + 1] = -9999;
        sz[i] = 0;
        continue;
      }
      const v = p.vel;
      v.y += p.gravity * dt;
      if (p.drag > 0) {
        // Clamped so a high drag at a long frame cannot flip the velocity.
        const k = Math.max(0, 1 - p.drag * dt);
        v.x *= k;
        v.y *= k;
        v.z *= k;
      }
      pos[o] += v.x * dt;
      pos[o + 1] += v.y * dt;
      pos[o + 2] += v.z * dt;

      // Age drives both the size and the colour travel; fading to a dark end
      // colour is how a particle disappears under additive blending.
      const age = 1 - p.life * p.invMaxLife;
      sz[i] = p.size0 + (p.size1 - p.size0) * age;
      col[o] = p.r0 + (p.r1 - p.r0) * age;
      col[o + 1] = p.g0 + (p.g1 - p.g0) * age;
      col[o + 2] = p.b0 + (p.b1 - p.b0) * age;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
