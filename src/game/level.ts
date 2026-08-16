import * as THREE from 'three';
import type { LevelDef, MoverEntity, PowerupType, Vec3 } from './types';
import { buildBlocks } from './builder';
import { getTexture, makeEnvMap } from './textures';
import { CollisionMesh, CollisionWorld, type MovingCollider } from '../engine/collision';
import {
  GO_TIME,
  MARBLE,
  Marble,
  NO_MODIFIERS,
  POWERUPS,
  SURFACES,
  type PhysicsModifiers,
} from '../engine/physics';
import { ChaseCamera } from '../engine/camera';
import type { Input } from '../engine/input';
import { Effects } from './effects';
import type { Audio } from './audio';

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);

const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const _spinQuat = new THREE.Quaternion();

const PHYSICS_HZ = 120;
const FIXED_DT = 1 / PHYSICS_HZ;

export type LevelPhase = 'countdown' | 'playing' | 'finished' | 'dead';

interface Gem {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  collected: boolean;
}

interface Powerup {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  type: PowerupType;
  cooldownUntil: number;
}

interface TimeTravel {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  ms: number;
  cooldownUntil: number;
}

interface Hazard {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  type: 'mine' | 'trapdoor' | 'bumper' | 'fan' | 'oilDrum';
  strength: number;
  collider?: MovingCollider;
  /** Trapdoors: ms at which they started opening. */
  triggeredAt: number;
  cooldownUntil: number;
}

interface Mover {
  def: MoverEntity;
  collider: MovingCollider;
  group: THREE.Object3D;
  waypoints: THREE.Vector3[];
  lastPos: THREE.Vector3;
  /** Fixed orientation of the platform, before any spin is applied. */
  baseRotation: THREE.Quaternion;
}

export interface ActivePowerup {
  type: PowerupType;
  until: number;
}

export class Level {
  readonly def: LevelDef;
  readonly scene = new THREE.Scene();
  readonly world = new CollisionWorld();
  readonly marble = new Marble();
  readonly camera: ChaseCamera;

  phase: LevelPhase = 'countdown';
  /** Gameplay clock in ms; does not run during the countdown. */
  clock = 0;
  /** Time since the level was entered, for the countdown and animations. */
  elapsed = 0;
  gemsCollected = 0;
  gemsTotal = 0;
  finishTime = 0;

  heldPowerup: PowerupType | null = null;
  active: ActivePowerup[] = [];

  private gems: Gem[] = [];
  private powerups: Powerup[] = [];
  private timeTravels: TimeTravel[] = [];
  private hazards: Hazard[] = [];
  private movers: Mover[] = [];
  private endPad: THREE.Vector3 | null = null;
  private startPad: THREE.Vector3 | null = null;
  private checkpoint: THREE.Vector3 | null = null;

  private marbleMesh!: THREE.Mesh;
  private accumulator = 0;
  private mods: PhysicsModifiers = NO_MODIFIERS();
  private up = new THREE.Vector3(0, 1, 0);
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private moveDir = new THREE.Vector2();
  private look = new THREE.Vector2();
  private effects: Effects;
  private audio: Audio | null;
  private killY: number;
  private prevJump = false;
  private prevUse = false;

  constructor(def: LevelDef, renderer: THREE.WebGLRenderer, aspect: number, audio: Audio | null) {
    this.def = def;
    this.audio = audio;
    this.camera = new ChaseCamera(aspect);
    this.killY = def.killY ?? -60;

    this.buildEnvironment(renderer);
    this.buildGeometry();
    this.buildEntities();
    this.buildMarble(renderer);

    this.effects = new Effects(this.scene);
    this.world.build();
    this.respawn(true);
  }

  // ---------------------------------------------------------------- building

  private buildEnvironment(renderer: THREE.WebGLRenderer) {
    const sky = this.def.sky;
    this.scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    this.scene.background = new THREE.Color(sky.bottom);

    // Sky dome: a large inverted sphere with a vertical gradient. Cheaper and
    // more controllable than a cubemap, and it lets each level set its own
    // time of day.
    const domeGeo = new THREE.SphereGeometry(600, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(sky.top) },
        bottom: { value: new THREE.Color(sky.bottom) },
      },
      vertexShader: `
        varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vH = normalize(wp.xyz).y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying float vH;
        void main() {
          float t = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, pow(t, 0.8)), 1.0);
        }`,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -1;
    this.scene.add(dome);

    const sun = new THREE.DirectionalLight(sky.sunColor, 2.1);
    sun.position.copy(v3(sky.sunDir).normalize().multiplyScalar(80));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 60;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight(sky.top, sky.ambient, 1.0));
    this.scene.environment = makeEnvMap(renderer, sky.top, sky.ambient);
  }

  private sun!: THREE.DirectionalLight;

  private buildGeometry() {
    const built = buildBlocks(this.def.blocks);
    for (const m of built.meshes) this.scene.add(m);
    // Replace the world's static mesh with the built one.
    (this.world as unknown as { statics: CollisionMesh }).statics = built.collision;
  }

  private buildMarble(renderer: THREE.WebGLRenderer) {
    void renderer;
    const geo = new THREE.SphereGeometry(MARBLE.radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8e4ee,
      roughness: 0.12,
      metalness: 0.85,
      envMapIntensity: 1.4,
    });
    this.marbleMesh = new THREE.Mesh(geo, mat);
    this.marbleMesh.castShadow = true;
    this.scene.add(this.marbleMesh);
  }

  private buildEntities() {
    for (const e of this.def.entities) {
      switch (e.kind) {
        case 'gem': {
          const mesh = makeGem();
          mesh.position.copy(v3(e.pos));
          this.scene.add(mesh);
          this.gems.push({ mesh, pos: v3(e.pos), collected: false });
          this.gemsTotal++;
          break;
        }
        case 'startPad': {
          const pad = makePad(0x3f7fdc);
          pad.position.copy(v3(e.pos));
          if (e.rot) pad.rotation.set(e.rot[0], e.rot[1], e.rot[2]);
          this.scene.add(pad);
          this.startPad = v3(e.pos);
          break;
        }
        case 'endPad': {
          const pad = makePad(0x2fd06a);
          pad.position.copy(v3(e.pos));
          if (e.rot) pad.rotation.set(e.rot[0], e.rot[1], e.rot[2]);
          this.scene.add(pad);
          this.endPad = v3(e.pos);
          // The finish beacon is how the player finds the exit from across
          // the map, so it is deliberately tall and bright.
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.62, 14, 20, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0x59ff9c,
              transparent: true,
              opacity: 0.16,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          beam.position.copy(v3(e.pos)).add(new THREE.Vector3(0, 7, 0));
          this.scene.add(beam);
          break;
        }
        case 'powerup': {
          const mesh = makePowerup(e.type);
          mesh.position.copy(v3(e.pos));
          this.scene.add(mesh);
          this.powerups.push({ mesh, pos: v3(e.pos), type: e.type, cooldownUntil: 0 });
          break;
        }
        case 'timeTravel': {
          const mesh = makeTimeTravel();
          mesh.position.copy(v3(e.pos));
          this.scene.add(mesh);
          this.timeTravels.push({
            mesh,
            pos: v3(e.pos),
            ms: (e.seconds ?? 5) * 1000,
            cooldownUntil: 0,
          });
          break;
        }
        case 'hazard': {
          this.buildHazard(e);
          break;
        }
        case 'mover': {
          this.buildMover(e);
          break;
        }
        case 'checkpoint': {
          const mesh = makeCheckpoint();
          mesh.position.copy(v3(e.pos));
          this.scene.add(mesh);
          break;
        }
        case 'prop':
          break;
      }
    }
  }

  private buildHazard(e: Extract<LevelDef['entities'][number], { kind: 'hazard' }>) {
    const pos = v3(e.pos);
    let mesh: THREE.Object3D;
    let collider: MovingCollider | undefined;

    if (e.type === 'trapdoor') {
      const size = e.size ?? [4, 0.3, 4];
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map: getTexture('wood'), roughness: 0.9 }),
      );
      m.castShadow = m.receiveShadow = true;
      mesh = new THREE.Group();
      // Hinge on the -X edge so the door swings down and away.
      m.position.set(size[0] / 2, 0, 0);
      mesh.add(m);
      mesh.position.copy(pos).sub(new THREE.Vector3(size[0] / 2, 0, 0));
      this.scene.add(mesh);

      const cm = new CollisionMesh();
      const g = geo.toNonIndexed();
      g.translate(size[0] / 2, 0, 0);
      cm.addTriangles(g.getAttribute('position').array as Float32Array, SURFACES.default);
      collider = this.world.addMover(cm);
    } else if (e.type === 'bumper') {
      mesh = makeBumper();
      mesh.position.copy(pos);
      this.scene.add(mesh);
    } else if (e.type === 'mine') {
      mesh = makeMine();
      mesh.position.copy(pos);
      this.scene.add(mesh);
    } else if (e.type === 'fan') {
      mesh = makeFan();
      mesh.position.copy(pos);
      if (e.rot) mesh.rotation.set(e.rot[0], e.rot[1], e.rot[2]);
      this.scene.add(mesh);
    } else {
      mesh = makeOilDrum();
      mesh.position.copy(pos);
      this.scene.add(mesh);
    }

    this.hazards.push({
      mesh,
      pos,
      type: e.type,
      strength: e.strength ?? (e.type === 'fan' ? 10 : POWERUPS.bumperImpulse),
      collider,
      triggeredAt: -1,
      cooldownUntil: 0,
    });
  }

  private buildMover(e: MoverEntity) {
    const geo = new THREE.BoxGeometry(e.size[0], e.size[1], e.size[2]);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: getTexture(e.texture ?? 'steel'),
        roughness: 0.8,
        metalness: 0.3,
      }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.position.copy(v3(e.pos));
    this.scene.add(group);

    const cm = new CollisionMesh();
    cm.addTriangles(
      geo.toNonIndexed().getAttribute('position').array as Float32Array,
      SURFACES[e.surface ?? 'steel'] ?? SURFACES.default,
    );
    const collider = this.world.addMover(cm);

    const baseRotation = new THREE.Quaternion();
    if (e.rot) baseRotation.setFromEuler(new THREE.Euler(e.rot[0], e.rot[1], e.rot[2], 'XYZ'));
    mesh.quaternion.copy(baseRotation);

    const base = v3(e.pos);
    const waypoints = e.path.length
      ? e.path.map((p) => base.clone().add(v3(p)))
      : [base.clone()];
    this.movers.push({
      def: e,
      collider,
      group,
      waypoints: [base.clone(), ...waypoints],
      lastPos: base.clone(),
      baseRotation,
    });
  }

  // ----------------------------------------------------------------- runtime

  respawn(full: boolean) {
    const spawn = this.checkpoint && !full ? this.checkpoint : v3(this.def.spawn.pos);
    this.marble.reset(spawn);
    this.marble.radius = MARBLE.radius;
    this.camera.reset(spawn, this.def.spawn.yaw);
    this.active.length = 0;
    this.heldPowerup = null;
    this.mods = NO_MODIFIERS();

    if (full) {
      this.phase = 'countdown';
      this.clock = 0;
      this.elapsed = 0;
      this.gemsCollected = 0;
      this.checkpoint = null;
      for (const g of this.gems) {
        g.collected = false;
        g.mesh.visible = true;
      }
      for (const p of this.powerups) {
        p.cooldownUntil = 0;
        p.mesh.visible = true;
      }
      for (const t of this.timeTravels) {
        t.cooldownUntil = 0;
        t.mesh.visible = true;
      }
      for (const h of this.hazards) {
        h.triggeredAt = -1;
        h.cooldownUntil = 0;
        if (h.collider) {
          h.collider.enabled = true;
          h.mesh.rotation.z = 0;
          h.mesh.visible = true;
        }
      }
    } else {
      this.phase = 'playing';
    }
  }

  /** Called once per rendered frame. */
  update(dt: number, input: Input) {
    dt = Math.min(dt, 0.1);
    this.elapsed += dt * 1000;

    if (this.phase === 'countdown' && this.elapsed >= GO_TIME) {
      this.phase = 'playing';
      this.audio?.play('go');
    }

    // Look is applied per frame, not per physics tick, so aiming stays smooth
    // and framerate-independent.
    input.takeLook(this.look);
    this.camera.look(this.look.x, this.look.y);

    this.updateMovers(dt);

    const playable = this.phase === 'playing';
    if (playable) this.clock += dt * 1000;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 8) {
      this.accumulator -= FIXED_DT;
      steps++;
      this.physicsStep(FIXED_DT, input, playable);
    }
    // If we fell far behind, drop the backlog rather than spiralling.
    if (this.accumulator > FIXED_DT * 8) this.accumulator = 0;

    this.updatePowerupTimers();
    this.updatePickups();
    this.updateHazards(dt);
    this.animateEntities(dt);

    this.marbleMesh.position.copy(this.marble.position);
    this.marbleMesh.quaternion.copy(this.marble.orientation);
    this.marbleMesh.scale.setScalar(this.marble.radius / MARBLE.radius);

    this.camera.update(this.marble.position, this.world, dt, this.up);
    this.effects.update(dt, this.marble);
    this.updateSun();

    if (playable && this.marble.position.y < this.killY) this.die();
  }

  private updateSun() {
    // Keep the shadow frustum centred on the marble; a level-sized frustum
    // would blur every shadow into uselessness.
    this.sun.target.position.copy(this.marble.position);
    this.sun.position
      .copy(v3(this.def.sky.sunDir))
      .normalize()
      .multiplyScalar(80)
      .add(this.marble.position);
  }

  private physicsStep(dt: number, input: Input, playable: boolean) {
    const before = this.marble.velocity.length();

    this.camera.basis(this.up, this.forward, this.right);
    if (playable) {
      this.moveDir.set(0, 0);
      const f = input.state.forward;
      const r = input.state.right;
      if (f || r) {
        // Build the world-space direction from the camera basis, then hand the
        // physics a 2D vector in that same frame.
        const dir = this.forward.clone().multiplyScalar(f).addScaledVector(this.right, r);
        if (dir.lengthSq() > 1) dir.normalize();
        this.moveDir.set(dir.x, dir.z);
      }
    } else {
      this.moveDir.set(0, 0);
    }

    this.marble.step(
      dt,
      this.world,
      {
        dir: this.moveDir,
        jump: playable && input.state.jump,
        brake: playable && input.state.brake,
      },
      this.mods,
    );

    if (this.marble.impactSpeed > 1) {
      this.audio?.impact(this.marble.impactSpeed);
      if (this.marble.impactSpeed > 6) this.effects.burst(this.marble.position, this.marble.groundNormal);
    }
    void before;
  }

  private updateMovers(dt: number) {
    for (const m of this.movers) {
      const def = m.def;
      const count = m.waypoints.length;
      if (count < 2 && !def.spin) {
        m.collider.matrix.compose(m.group.position, m.baseRotation, ONE);
        m.collider.inverse.copy(m.collider.matrix).invert();
        m.collider.origin.copy(m.group.position);
        continue;
      }

      const period = Math.max(0.1, def.period);
      const dwell = def.dwell ?? 0;
      const legs = count - 1;
      const legTime = (period / 2 - dwell * legs) / legs;

      // Ping-pong along the waypoint list.
      const t = (this.elapsed / 1000) % period;
      const half = period / 2;
      const forward = t < half;
      const local = forward ? t : period - t;

      let pos = m.waypoints[0];
      let acc = 0;
      for (let i = 0; i < legs; i++) {
        if (local < acc + dwell) {
          pos = m.waypoints[i];
          break;
        }
        acc += dwell;
        if (local < acc + legTime) {
          const f = legTime > 0 ? (local - acc) / legTime : 1;
          // Smoothstep so platforms ease rather than snap, which keeps the
          // marble from being flung on direction changes.
          const s = f * f * (3 - 2 * f);
          pos = m.waypoints[i].clone().lerp(m.waypoints[i + 1], s);
          break;
        }
        acc += legTime;
        pos = m.waypoints[i + 1];
      }

      const spin = def.spin ? def.spin * (this.elapsed / 1000) : 0;
      m.group.position.copy(pos);
      m.group.rotation.y = spin;

      // Spin is applied about world Y, on top of the platform's fixed tilt.
      const q = _spinQuat.setFromAxisAngle(UP, spin).multiply(m.baseRotation);
      m.collider.matrix.compose(pos, q, ONE);
      m.collider.inverse.copy(m.collider.matrix).invert();
      m.collider.origin.copy(pos);
      m.collider.velocity.subVectors(pos, m.lastPos).divideScalar(Math.max(dt, 1e-4));
      m.collider.angularVelocity.set(0, def.spin ?? 0, 0);
      m.lastPos.copy(pos);
    }
  }

  private updatePickups() {
    // Marble Blast uses a pickup sphere twice the marble's radius, which is
    // why gems feel generous to grab at speed.
    const reach = this.marble.radius * 2;
    const p = this.marble.position;

    for (const g of this.gems) {
      if (g.collected) continue;
      if (p.distanceToSquared(g.pos) < (reach + 0.45) ** 2) {
        g.collected = true;
        g.mesh.visible = false;
        this.gemsCollected++;
        this.effects.sparkle(g.pos, 0xff4fd8);
        this.audio?.play(this.gemsCollected >= this.gemsTotal ? 'gemAll' : 'gem');
      }
    }

    for (const pu of this.powerups) {
      if (this.elapsed < pu.cooldownUntil) continue;
      if (p.distanceToSquared(pu.pos) < (reach + 0.5) ** 2) {
        if (this.heldPowerup === pu.type) continue;
        this.heldPowerup = pu.type;
        pu.cooldownUntil = this.elapsed + POWERUPS.respawnCooldown;
        pu.mesh.visible = false;
        this.audio?.play('pickup');
      }
    }

    for (const tt of this.timeTravels) {
      if (this.elapsed < tt.cooldownUntil) continue;
      if (p.distanceToSquared(tt.pos) < (reach + 0.5) ** 2) {
        // Time travel never respawns in Marble Blast.
        tt.cooldownUntil = Infinity;
        tt.mesh.visible = false;
        this.clock = Math.max(0, this.clock - tt.ms);
        this.effects.sparkle(tt.pos, 0x66ddff);
        this.audio?.play('timeTravel');
      }
    }

    if (this.endPad && this.phase === 'playing' && this.gemsCollected >= this.gemsTotal) {
      const d = p.clone().sub(this.endPad);
      if (Math.abs(d.y) < 1.6 && d.x * d.x + d.z * d.z < 1.4 * 1.4) this.finish();
    }
  }

  usePowerup() {
    if (!this.heldPowerup || this.phase !== 'playing') return;
    const type = this.heldPowerup;
    this.heldPowerup = null;

    switch (type) {
      case 'superSpeed': {
        // Fires along the camera's forward, projected onto the surface the
        // marble is touching, so a boost on a ramp follows the ramp.
        this.camera.basis(this.up, this.forward, this.right);
        const dir = this.forward.clone();
        const n = this.marble.onGround ? this.marble.groundNormal : this.up;
        dir.addScaledVector(n, -dir.dot(n));
        if (dir.lengthSq() < 1e-6) dir.copy(this.forward);
        dir.normalize();
        this.marble.velocity.addScaledVector(dir, POWERUPS.superSpeed.impulse);
        break;
      }
      case 'superJump':
        this.marble.velocity.addScaledVector(this.up, POWERUPS.superJump.impulse);
        break;
      case 'superBounce':
        this.setActive(type, POWERUPS.superBounce.duration);
        break;
      case 'shockAbsorber':
        this.setActive(type, POWERUPS.shockAbsorber.duration);
        break;
      case 'gyrocopter':
        this.setActive(type, POWERUPS.gyrocopter.duration);
        break;
      case 'megaMarble':
        this.setActive(type, POWERUPS.megaMarble.duration);
        this.marble.velocity.addScaledVector(this.up, POWERUPS.megaMarble.kick);
        break;
    }
    this.effects.sparkle(this.marble.position, 0xffe066);
    this.audio?.play('powerup');
    this.applyModifiers();
  }

  private setActive(type: PowerupType, duration: number) {
    const existing = this.active.find((a) => a.type === type);
    if (existing) existing.until = this.elapsed + duration;
    else this.active.push({ type, until: this.elapsed + duration });
  }

  private updatePowerupTimers() {
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.elapsed >= this.active[i].until) {
        this.active.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.applyModifiers();

    for (const pu of this.powerups) {
      if (!pu.mesh.visible && this.elapsed >= pu.cooldownUntil) pu.mesh.visible = true;
    }
  }

  private applyModifiers() {
    const m = NO_MODIFIERS();
    let radius = MARBLE.radius;
    for (const a of this.active) {
      switch (a.type) {
        case 'superBounce':
          m.restitutionScale = POWERUPS.superBounce.restitution / MARBLE.bounceRestitution;
          break;
        case 'shockAbsorber':
          m.restitutionScale = POWERUPS.shockAbsorber.restitution / MARBLE.bounceRestitution;
          break;
        case 'gyrocopter':
          m.gravityScale = POWERUPS.gyrocopter.gravityScale;
          break;
        case 'megaMarble':
          radius = POWERUPS.megaMarble.radius;
          break;
        default:
          break;
      }
    }
    this.mods = m;
    this.marble.radius = radius;
  }

  private updateHazards(dt: number) {
    const p = this.marble.position;
    const reach = this.marble.radius;

    for (const h of this.hazards) {
      switch (h.type) {
        case 'bumper': {
          if (this.elapsed < h.cooldownUntil) break;
          if (p.distanceToSquared(h.pos) < (reach + 0.8) ** 2) {
            const dir = p.clone().sub(h.pos);
            dir.y = Math.max(dir.y, 0.15);
            dir.normalize();
            // Bumpers set speed along the normal rather than adding to it, so
            // the launch is predictable no matter how fast you arrived.
            const along = this.marble.velocity.dot(dir);
            this.marble.velocity.addScaledVector(dir, h.strength - along);
            h.cooldownUntil = this.elapsed + 200;
            this.audio?.play('bumper');
            this.effects.sparkle(h.pos, 0xffaa33);
            h.mesh.scale.set(1.25, 0.7, 1.25);
          }
          h.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * dt));
          break;
        }
        case 'mine': {
          if (this.elapsed < h.cooldownUntil) break;
          if (p.distanceToSquared(h.pos) < (reach + 0.55) ** 2) {
            const dir = p.clone().sub(h.pos);
            const dist = Math.max(dir.length(), 0.3);
            dir.divideScalar(dist);
            dir.y = Math.abs(dir.y) + 0.5;
            dir.normalize();
            this.marble.velocity.addScaledVector(dir, 22 / Math.max(1, dist));
            h.cooldownUntil = this.elapsed + POWERUPS.respawnCooldown;
            h.mesh.visible = false;
            this.audio?.play('explode');
            this.effects.explosion(h.pos);
          }
          if (!h.mesh.visible && this.elapsed >= h.cooldownUntil) h.mesh.visible = true;
          break;
        }
        case 'trapdoor': {
          if (!h.collider) break;
          if (h.triggeredAt < 0) {
            // Trigger on contact from above, then fall away after a beat.
            const local = p.clone().sub(h.mesh.position);
            if (Math.abs(local.y) < 0.6 && Math.abs(local.x - 2) < 2.4 && Math.abs(local.z) < 2.4) {
              h.triggeredAt = this.elapsed;
              this.audio?.play('trapdoor');
            }
          } else {
            const since = this.elapsed - h.triggeredAt;
            if (since > 200) {
              const t = Math.min(1, (since - 200) / 500);
              h.mesh.rotation.z = -t * Math.PI * 0.55;
              const q = new THREE.Quaternion().setFromEuler(h.mesh.rotation);
              h.collider.matrix.compose(h.mesh.position, q, new THREE.Vector3(1, 1, 1));
              h.collider.inverse.copy(h.collider.matrix).invert();
              h.collider.origin.copy(h.mesh.position);
              if (t >= 1) h.collider.enabled = false;
            }
            if (since > 5000) {
              h.triggeredAt = -1;
              h.mesh.rotation.z = 0;
              h.collider.enabled = true;
              h.collider.matrix.identity().setPosition(h.mesh.position);
              h.collider.inverse.copy(h.collider.matrix).invert();
            }
          }
          break;
        }
        case 'fan': {
          const toMarble = p.clone().sub(h.pos);
          const dist = toMarble.length();
          if (dist > 40 || dist < 1e-3) break;
          const axis = new THREE.Vector3(0, 1, 0).applyEuler(h.mesh.rotation);
          const cos = toMarble.dot(axis) / dist;
          if (cos < Math.cos(2.617 / 2)) break;
          // Falls off with distance so the fan is a nudge at the edge of its
          // cone and a lift directly above it.
          const falloff = 1 - dist / 40;
          this.marble.velocity.addScaledVector(axis, h.strength * falloff * dt);
          break;
        }
        case 'oilDrum':
          break;
      }
    }
  }

  private animateEntities(dt: number) {
    const t = this.elapsed / 1000;
    for (const g of this.gems) {
      if (!g.mesh.visible) continue;
      g.mesh.rotation.y = t * 1.8;
      g.mesh.position.y = g.pos.y + Math.sin(t * 2.2) * 0.09;
    }
    for (const p of this.powerups) {
      p.mesh.rotation.y = t * 1.2;
      p.mesh.position.y = p.pos.y + Math.sin(t * 1.7) * 0.11;
    }
    for (const tt of this.timeTravels) {
      tt.mesh.rotation.y = t * 2.4;
      tt.mesh.position.y = tt.pos.y + Math.sin(t * 2.0) * 0.1;
    }
    void dt;
  }

  private finish() {
    this.phase = 'finished';
    this.finishTime = this.clock;
    this.audio?.play('finish');
    this.effects.sparkle(this.marble.position, 0x66ff99);
  }

  private die() {
    this.phase = 'dead';
    this.audio?.play('fall');
    // Marble Blast puts you straight back on the pad; a death screen would
    // break the flow of a 40-second level.
    setTimeout(() => {
      if (this.phase === 'dead') {
        this.respawn(false);
        this.phase = 'playing';
      }
    }, 500);
  }

  handleUseInput(input: Input) {
    const use = input.state.usePowerup;
    if (use && !this.prevUse) this.usePowerup();
    this.prevUse = use;
    void this.prevJump;
  }

  setAspect(aspect: number) {
    this.camera.setAspect(aspect);
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}

// ------------------------------------------------------------- entity meshes

function makeGem(): THREE.Mesh {
  const geo = new THREE.OctahedronGeometry(0.3, 0);
  geo.scale(1, 1.35, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff3fc8,
    emissive: 0x8a1f6a,
    emissiveIntensity: 0.75,
    roughness: 0.15,
    metalness: 0.4,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function makePad(color: number): THREE.Object3D {
  const group = new THREE.Group();
  // Pads sit flush with the floor they are placed on: the entity position is
  // the floor height, so the marble rests on the ground, not inside the pad.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.1, 28),
    new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.7, metalness: 0.3 }),
  );
  base.position.y = -0.05;
  base.receiveShadow = true;
  group.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.07, 10, 32),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.005;
  group.add(ring);
  return group;
}

const POWERUP_COLORS: Record<PowerupType, number> = {
  superSpeed: 0xff5a2b,
  superJump: 0x39c7ff,
  superBounce: 0xc65cff,
  shockAbsorber: 0x9aa4ad,
  gyrocopter: 0x4de08a,
  megaMarble: 0xffd23f,
};

function makePowerup(type: PowerupType): THREE.Object3D {
  const group = new THREE.Group();
  const color = POWERUP_COLORS[type];
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.5,
    }),
  );
  shell.castShadow = true;
  group.add(shell);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.035, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  return group;
}

function makeTimeTravel(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.09, 10, 24),
    new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      emissive: 0x1f7f9c,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.6,
    }),
  );
  body.castShadow = true;
  group.add(body);
  return group;
}

function makeBumper(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x662f00, roughness: 0.5 }),
  );
  body.castShadow = true;
  group.add(body);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.14, 20),
    new THREE.MeshStandardMaterial({ color: 0xffd07a, emissive: 0x7a5a10, roughness: 0.4 }),
  );
  top.position.y = 0.3;
  group.add(top);
  return group;
}

function makeMine(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.6, metalness: 0.5 }),
  );
  body.castShadow = true;
  group.add(body);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd23b2b, roughness: 0.5 });
  for (const dir of [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), spikeMat);
    spike.position.set(dir[0] * 0.33, dir[1] * 0.33, dir[2] * 0.33);
    spike.lookAt(new THREE.Vector3(dir[0] * 2, dir[1] * 2, dir[2] * 2));
    spike.rotateX(Math.PI / 2);
    group.add(spike);
  }
  return group;
}

function makeFan(): THREE.Object3D {
  const group = new THREE.Group();
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.3, 20, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x8b9096,
      roughness: 0.6,
      metalness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  group.add(housing);
  const blades = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.04, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x4d5257, roughness: 0.5, metalness: 0.6 }),
  );
  group.add(blades);
  const blades2 = blades.clone();
  blades2.rotation.y = Math.PI / 2;
  group.add(blades2);
  return group;
}

function makeOilDrum(): THREE.Object3D {
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16),
    new THREE.MeshStandardMaterial({ map: getTexture('rust'), roughness: 0.85, metalness: 0.3 }),
  );
  drum.castShadow = drum.receiveShadow = true;
  return drum;
}

function makeCheckpoint(): THREE.Object3D {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.5, metalness: 0.6 }),
  );
  post.position.y = 0.8;
  group.add(post);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, side: THREE.DoubleSide, roughness: 0.7 }),
  );
  flag.position.set(0.35, 1.35, 0);
  group.add(flag);
  return group;
}
