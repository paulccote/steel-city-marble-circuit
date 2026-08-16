import * as THREE from 'three';

/**
 * Marble physics, modelled on the Torque `marble` datablock used by Marble
 * Blast. The marble is not a generic rigid body: it is driven by angular
 * acceleration, and friction at the contact point is what converts spin into
 * linear motion. That indirection is the reason the marble feels heavy on
 * ramps, drifts on ice, and cannot exceed maxRollVelocity by rolling alone.
 */
export const MARBLE = {
  radius: 0.2,
  mass: 1,

  gravity: 20,

  maxRollVelocity: 15,
  angularAcceleration: 75,
  brakingAcceleration: 30,
  airAcceleration: 5,

  staticFriction: 1.1,
  kineticFriction: 0.7,
  bounceKineticFriction: 0.2,

  bounceRestitution: 0.5,
  /** A surface steeper than this is a wall: it grants no jump and no control. */
  maxDotSlide: 0.5,

  jumpImpulse: 7.5,

  /** Angular velocity bleeds off slowly in midair so spin survives a hop. */
  angularSpringK: 0,
  maxAngularVelocity: 1000,
};

/**
 * Powerup parameters, matching Marble Blast exactly. Durations in ms.
 */
export const POWERUPS = {
  superSpeed: { impulse: 25 },
  superJump: { impulse: 20 },
  superBounce: { restitution: 0.9, duration: 5000 },
  shockAbsorber: { restitution: 0.01, duration: 5000 },
  gyrocopter: { gravityScale: 0.25, airAccelScale: 2, duration: 5000 },
  megaMarble: { radius: 0.6666, kick: 6, duration: 10000 },
  timeTravel: { defaultBonus: 5000 },
  respawnCooldown: 7000,
  bumperImpulse: 15,
} as const;

/** Countdown before the start pad releases the marble. */
export const GO_TIME = 3500;

export interface SurfaceMaterial {
  friction: number;
  restitution: number;
  /** Identifier so gameplay can react (ice, sand, lava, grass...). */
  kind: string;
}

export const DEFAULT_MATERIAL: SurfaceMaterial = { friction: 1, restitution: 1, kind: 'default' };

/**
 * Surface multipliers applied on top of the marble's own coefficients. These
 * are the Marble Blast values; the Pittsburgh set below reuses them so a
 * cobblestone street or an icy bridge deck behaves like a surface a Marble
 * Blast player already has instincts for.
 */
export const SURFACES: Record<string, SurfaceMaterial> = {
  default: DEFAULT_MATERIAL,
  ice: { friction: 0.03, restitution: 0.95, kind: 'ice' },
  slick: { friction: 0.05, restitution: 0.5, kind: 'slick' },
  lowFriction: { friction: 0.2, restitution: 0.5, kind: 'lowFriction' },
  tarmac: { friction: 0.35, restitution: 0.7, kind: 'tarmac' },
  cobblestone: { friction: 1.2, restitution: 0.4, kind: 'cobblestone' },
  grass: { friction: 1.5, restitution: 0.35, kind: 'grass' },
  highFriction: { friction: 1.5, restitution: 0.5, kind: 'highFriction' },
  rampYellow: { friction: 2, restitution: 1, kind: 'rampYellow' },
  sand: { friction: 4, restitution: 0.1, kind: 'sand' },
  carpet: { friction: 6, restitution: 0.5, kind: 'carpet' },
  water: { friction: 6, restitution: 0, kind: 'water' },
  steel: { friction: 0.9, restitution: 0.6, kind: 'steel' },
  bounceFloor: { friction: 0.2, restitution: 0, kind: 'bounceFloor' },
};

export interface Contact {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  depth: number;
  material: SurfaceMaterial;
  /** World velocity of the surface itself, for moving platforms. */
  surfaceVelocity: THREE.Vector3;
}

/** What the physics step needs from the collision world. */
export interface CollisionQuery {
  /**
   * All contacts for a sphere at `pos`. Implementations should include
   * surfaces within `radius + skin` so resting contact stays stable.
   */
  contacts(pos: THREE.Vector3, radius: number, out: Contact[]): void;
  /**
   * Earliest time of impact in [0,1] for a sphere swept from `from` by `delta`,
   * or -1 when the sweep is clear. Used for continuous collision so the marble
   * never tunnels a thin platform at speed.
   */
  sweep(from: THREE.Vector3, delta: THREE.Vector3, radius: number): number;
}

export interface MoveInput {
  /** Camera-relative desired direction on the horizontal plane, |d| <= 1. */
  dir: THREE.Vector2;
  jump: boolean;
  brake: boolean;
}

/** Powerup / gameplay modifiers applied for the duration of a step. */
export interface PhysicsModifiers {
  gravityScale: number;
  gravityUp: THREE.Vector3;
  restitutionScale: number;
  /** SuperSpeed adds acceleration along the input direction. */
  extraAccel: number;
  jumpScale: number;
}

export const NO_MODIFIERS = (): PhysicsModifiers => ({
  gravityScale: 1,
  gravityUp: new THREE.Vector3(0, 1, 0),
  restitutionScale: 1,
  extraAccel: 0,
  jumpScale: 1,
});

const _v = () => new THREE.Vector3();

export class Marble {
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  omega = new THREE.Vector3();
  radius = MARBLE.radius;

  /** Orientation is integrated from omega purely for rendering. */
  orientation = new THREE.Quaternion();

  onGround = false;
  groundNormal = new THREE.Vector3(0, 1, 0);
  lastContactMaterial: SurfaceMaterial = DEFAULT_MATERIAL;

  /** Set by the step when a real impact happened, for audio/particles. */
  impactSpeed = 0;
  slipSpeed = 0;

  private contacts: Contact[] = [];
  private jumpLatch = false;

  // scratch
  private _r = _v();
  private _rollVel = _v();
  private _vAtC = _v();
  private _tmp = _v();
  private _tmp2 = _v();
  private _aControl = _v();
  private _desiredOmega = _v();
  private _accel = _v();
  private _angAccel = _v();
  private _spin = new THREE.Quaternion();

  reset(pos: THREE.Vector3) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.orientation.identity();
    this.onGround = false;
    this.jumpLatch = false;
  }

  /**
   * Advance one fixed step. `dt` must be small and constant (1/120) — the
   * friction model is not stable under variable timesteps.
   */
  step(dt: number, world: CollisionQuery, input: MoveInput, mods: PhysicsModifiers) {
    const up = mods.gravityUp;
    const gravity = this._tmp.copy(up).multiplyScalar(-MARBLE.gravity * mods.gravityScale);

    this.impactSpeed = 0;
    this.slipSpeed = 0;

    world.contacts(this.position, this.radius, this.contacts);
    const ground = this.pickGround(up);
    this.onGround = ground !== null;
    if (ground) this.groundNormal.copy(ground.normal);

    // 1. Kill velocity heading into every surface we are touching, applying
    //    restitution on genuine impacts. Done before control so the marble
    //    cannot accelerate into a wall it is already flush against.
    this.cancelVelocity(mods);

    this._accel.copy(gravity);
    this._angAccel.set(0, 0, 0);

    if (ground) {
      this.applyContactForces(dt, ground, input, mods, up);
    } else {
      this.applyAirControl(input, mods, up);
    }

    // 2. Jump leaves along the contact normal, never the world up, so ramps
    //    and loops launch the marble the way the surface points.
    if (input.jump && ground && !this.jumpLatch) {
      const n = ground.normal;
      const along = this.velocity.dot(n);
      const target = MARBLE.jumpImpulse * mods.jumpScale;
      if (along < target) this.velocity.addScaledVector(n, target - along);
      this.jumpLatch = true;
      this.onGround = false;
    }
    if (!input.jump) this.jumpLatch = false;

    this.velocity.addScaledVector(this._accel, dt);
    this.omega.addScaledVector(this._angAccel, dt);

    const maxOmega = MARBLE.maxAngularVelocity;
    if (this.omega.lengthSq() > maxOmega * maxOmega) this.omega.setLength(maxOmega);

    this.cancelVelocity(mods);

    // 3. Integrate with continuous collision, splitting the step at each
    //    impact so a fast marble cannot pass through a thin platform.
    this.integrate(dt, world, mods);

    // 4. Orientation follows omega; purely cosmetic but it is most of what
    //    sells the speed on screen.
    const w = this.omega.length();
    if (w > 1e-6) {
      this._spin.setFromAxisAngle(this._tmp2.copy(this.omega).divideScalar(w), w * dt);
      this.orientation.premultiply(this._spin).normalize();
    }
  }

  /** The most floor-like contact: the one whose normal best opposes gravity. */
  private pickGround(up: THREE.Vector3): Contact | null {
    let best: Contact | null = null;
    let bestDot = MARBLE.maxDotSlide;
    for (const c of this.contacts) {
      const d = c.normal.dot(up);
      if (d > bestDot) {
        bestDot = d;
        best = c;
      }
    }
    return best;
  }

  private cancelVelocity(mods: PhysicsModifiers) {
    for (const c of this.contacts) {
      const rel = this._tmp.copy(this.velocity).sub(c.surfaceVelocity);
      const into = rel.dot(c.normal);
      if (into >= 0) continue;

      const speed = -into;
      const restitution = MARBLE.bounceRestitution * c.material.restitution * mods.restitutionScale;
      // Slow contacts settle instead of jittering; only real hits bounce.
      const bounce = speed > 1.5 ? restitution : 0;
      this.velocity.addScaledVector(c.normal, speed * (1 + bounce));

      if (speed > this.impactSpeed) this.impactSpeed = speed;

      if (bounce > 0) {
        // A bounce scrubs tangential speed, which is what stops the marble
        // skating forever after landing on a slope.
        const rel2 = this._tmp2.copy(this.velocity).sub(c.surfaceVelocity);
        const tangent = rel2.addScaledVector(c.normal, -rel2.dot(c.normal));
        const tMag = tangent.length();
        if (tMag > 0) {
          const scrub = Math.min(tMag, MARBLE.bounceKineticFriction * speed * c.material.friction);
          this.velocity.addScaledVector(tangent.divideScalar(tMag), -scrub);
        }
      }
      this.lastContactMaterial = c.material;
    }
  }

  /**
   * The heart of the model. Friction acts on the velocity of the marble's
   * *surface* at the contact point, not its centre, so a marble that is
   * sliding without spinning gets spun up, and a marble spinning without
   * moving gets launched forward.
   */
  private applyContactForces(
    dt: number,
    c: Contact,
    input: MoveInput,
    mods: PhysicsModifiers,
    up: THREE.Vector3,
  ) {
    const n = c.normal;
    const radius = this.radius;

    // Vector from centre to contact point.
    const R = this._r.copy(n).multiplyScalar(-radius);

    // Velocity of the marble's surface where it touches the world.
    const rollVel = this._rollVel.copy(this.omega).cross(R);
    const vAtC = this._vAtC.copy(this.velocity).add(rollVel).sub(c.surfaceVelocity);
    vAtC.addScaledVector(n, -vAtC.dot(n));
    const vAtCMag = vAtC.length();
    this.slipSpeed = vAtCMag;

    const normalForce = MARBLE.gravity * mods.gravityScale * Math.max(0.2, n.dot(up));

    if (vAtCMag > 1e-5) {
      const friction = MARBLE.kineticFriction * c.material.friction;
      const dir = this._tmp.copy(vAtC).divideScalar(vAtCMag);

      // Friction pushes the centre back and spins the marble up. The 5/2r
      // factor is the sphere's inertia term: I = 2/5 m r^2.
      const aMag = friction * normalForce;
      const angAMag = (5 * friction * normalForce) / (2 * radius);

      // Never overshoot: friction can at most bring the contact point to rest.
      let scale = 1;
      const deltaV = (aMag + angAMag * radius) * dt;
      if (deltaV > vAtCMag) scale = vAtCMag / deltaV;

      this._accel.addScaledVector(dir, -aMag * scale);
      this._angAccel.add(this._tmp2.copy(dir).multiplyScalar(-angAMag * scale).cross(R));
    }

    // Rolling control: steer toward the angular velocity that would roll the
    // marble in the input direction at maxRollVelocity.
    const aControl = this.controlDir(input, n, up, this._aControl);
    const controlMag = aControl.length();

    if (input.brake) {
      // Brake drives the contact point to rest rather than the centre, so it
      // works on slopes and while airborne-adjacent.
      const target = MARBLE.brakingAcceleration * dt;
      if (vAtCMag > 1e-5) {
        const dir = this._tmp.copy(vAtC).divideScalar(vAtCMag);
        const amount = Math.min(vAtCMag, target);
        this._accel.addScaledVector(dir, -amount / dt);
      }
      this._angAccel.addScaledVector(this.omega, -Math.min(1 / dt, MARBLE.brakingAcceleration));
    } else if (controlMag > 1e-5) {
      const desiredOmega = this._desiredOmega.copy(n).cross(aControl);
      desiredOmega.multiplyScalar(MARBLE.maxRollVelocity / radius);

      const delta = desiredOmega.sub(this.omega);
      const maxDelta = MARBLE.angularAcceleration * dt;
      const dMag = delta.length();
      if (dMag > maxDelta) delta.multiplyScalar(maxDelta / dMag);
      this._angAccel.addScaledVector(delta, 1 / dt);

      // SuperSpeed bypasses the friction budget and shoves the centre
      // directly, which is why it can push past maxRollVelocity.
      if (mods.extraAccel > 0) {
        this._accel.addScaledVector(aControl, mods.extraAccel / Math.max(controlMag, 1e-5));
      }
    }
  }

  private applyAirControl(input: MoveInput, mods: PhysicsModifiers, up: THREE.Vector3) {
    const dir = this.controlDir(input, up, up, this._aControl);
    if (dir.lengthSq() < 1e-10) return;
    this._accel.addScaledVector(dir, MARBLE.airAcceleration + mods.extraAccel);
  }

  /** Input mapped onto the contact plane, so control follows the surface. */
  private controlDir(input: MoveInput, normal: THREE.Vector3, up: THREE.Vector3, out: THREE.Vector3) {
    out.set(input.dir.x, 0, input.dir.y);
    if (out.lengthSq() < 1e-10) return out.set(0, 0, 0);
    // Project onto the surface plane and renormalise to preserve input
    // magnitude — otherwise steep ramps quietly weaken control.
    const mag = Math.min(1, out.length());
    out.addScaledVector(normal, -out.dot(normal));
    const l = out.length();
    if (l > 1e-6) out.multiplyScalar(mag / l);
    return out;
  }

  private integrate(dt: number, world: CollisionQuery, mods: PhysicsModifiers) {
    let remaining = dt;
    const delta = _v();

    for (let iter = 0; iter < 4 && remaining > 1e-6; iter++) {
      delta.copy(this.velocity).multiplyScalar(remaining);
      if (delta.lengthSq() < 1e-12) break;

      const toi = world.sweep(this.position, delta, this.radius);
      if (toi < 0) {
        this.position.add(delta);
        break;
      }

      // Advance to just before the impact, then re-solve contacts and cancel
      // the inbound velocity so the remainder of the step slides along.
      const safe = Math.max(0, toi - 1e-4);
      this.position.addScaledVector(delta, safe);
      remaining *= 1 - safe;

      world.contacts(this.position, this.radius, this.contacts);
      this.cancelVelocity(mods);
      if (this.velocity.lengthSq() < 1e-12) break;
    }

    // Push out of anything we ended up inside; without this the marble sinks
    // into corners where two triangles both claim it.
    world.contacts(this.position, this.radius, this.contacts);
    for (const c of this.contacts) {
      if (c.depth > 0) this.position.addScaledVector(c.normal, c.depth);
    }
  }
}
