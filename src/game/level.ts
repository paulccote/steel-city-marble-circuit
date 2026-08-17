import * as THREE from 'three';
import type { LevelDef, MoverEntity, PowerupType, Vec3 } from './types';
import { buildBlocks, setBackdropFog } from './builder';
import {
  getGlowTexture,
  getTexture,
  makeEnvMap,
  makeMarbleTexture,
  makePadTexture,
} from './textures';
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

  /** Fired when a held powerup is actually spent, so the HUD can react. */
  onPowerupUsed: ((type: PowerupType) => void) | null = null;

  private gems: Gem[] = [];
  private powerups: Powerup[] = [];
  private timeTravels: TimeTravel[] = [];
  private hazards: Hazard[] = [];
  private movers: Mover[] = [];
  private endPad: THREE.Vector3 | null = null;
  private startPad: THREE.Vector3 | null = null;
  private checkpoint: THREE.Vector3 | null = null;
  private checkpoints: { mesh: THREE.Object3D; pos: THREE.Vector3; armed: boolean }[] = [];

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
  /** Which countdown second we last played, counting down to GO. */
  private lastBeat = 99;

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

    // ACES rolls every saturated colour back toward grey — it is a film look,
    // and it is most of the reason this scene read as sludge. Marble Blast
    // clips instead, which is what keeps its greens green and its golds gold.
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.0;
    // PCFSoftShadowMap is deprecated in this Three and silently falls back to
    // this anyway; asking for it directly keeps the console clean.
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const skyTop = punch(sky.top, 1.45, 0.98);
    const skyBottom = punch(sky.bottom, 1.6, 1.0);
    const horizon = punch(sky.bottom, 1.2, 1.08);
    // Deliberately darker and more saturated than the sky it sits under. Fog
    // the same value as the sky gives a level no horizon at all: the far river
    // and the sky above it converge on one grey and the world reads as a void.
    // Distance should be a band you can see the edge of.
    const fogColor = punch(sky.fog, 1.4, 0.88);
    const bounce = punch(sky.ambient, 1.7, 1.15);
    const sunColor = punch(sky.sunColor, 1.8, 1.0);
    const sunDir = v3(sky.sunDir).normalize();

    // Two fog curves, because the scene has two jobs for fog and they pull in
    // opposite directions. Pulling the single curve in far enough to sink the
    // downtown skyline also erased the Clemente's towers and chain, which are
    // both distant and the whole point of that level. So: the scene's fog is
    // now authored for gameplay and reaches well past the far end of the
    // level, while backdrop meshes — non-colliding and standing clear of
    // anything the marble can touch — take a much tighter curve of their own
    // (see setBackdropFog / extendMaterial in builder.ts).
    this.scene.fog = new THREE.Fog(fogColor, sky.fogNear, sky.fogFar * 1.35);
    // Water reflects the haze band, not the bright sky above it. Handing it
    // the fog colour is what puts a hard edge between the far river and the
    // sky instead of letting the two meet in the middle and cancel out.
    setBackdropFog(
      sky.fogNear * 0.85,
      sky.fogFar * 0.7,
      fogColor.clone().lerp(horizon, 0.3),
    );
    this.scene.background = skyBottom;

    // Sky dome: a large inverted sphere with a vertical gradient. Cheaper and
    // more controllable than a cubemap, and it lets each level set its own
    // time of day. The sun disc is drawn into it so the key light has a
    // visible source to point back at.
    const domeGeo = new THREE.SphereGeometry(600, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: skyTop },
        bottom: { value: skyBottom },
        horizon: { value: horizon },
        // What lies past the end of the level: haze over distant ground, a
        // clear step darker than the sky.
        ground: { value: fogColor.clone().multiplyScalar(0.8) },
        sunDir: { value: sunDir.clone() },
        sunColor: { value: sunColor },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon;
        uniform vec3 ground;
        uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(t, 0.65));
          col = mix(col, horizon, pow(1.0 - abs(vDir.y), 10.0));
          // A hard-ish line at eye level. Every one of these levels is set on
          // a river or a hillside and stops well short of the horizon, so
          // without this the dome hands them a white void to end in.
          col = mix(col, ground, smoothstep(0.015, -0.045, vDir.y));
          float s = max(dot(vDir, sunDir), 0.0);
          col += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 14.0) * 0.22);
          gl_FragColor = vec4(col, 1.0);
          // Uniforms arrive linear; without these the dome would be written
          // straight to an sRGB buffer and the sky would come out muddy.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -1;
    this.scene.add(dome);

    // A hard key light with a cool, weak fill. The reference's readability is
    // almost entirely this ratio: lit faces near white, shadowed faces clearly
    // darker and tinted toward the sky rather than toward black.
    const sun = new THREE.DirectionalLight(sunColor, 3.0);
    sun.position.copy(sunDir).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // A tight frustum around the marble: 40 units of coverage at 2048 gives
    // ~4cm shadow texels, which is what stops shadows from turning into the
    // blocky smear they were.
    const s = 38;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 175;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight(skyTop, bounce, 0.7));
    this.scene.environment = makeEnvMap(renderer, {
      top: hex(skyTop),
      horizon: hex(horizon),
      ground: hex(bounce),
      sun: hex(sunColor),
      sunHeight: sunDir.y,
    });
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
    // The marble is on screen every frame of the game, so it is the one object
    // worth spending a physical material on: a swirled glass body under a
    // clearcoat, which gives it both a coloured interior and the hard white
    // highlight that reads as "polished" against any background.
    const geo = new THREE.SphereGeometry(MARBLE.radius, 48, 32);
    const mat = new THREE.MeshPhysicalMaterial({
      map: makeMarbleTexture(),
      color: 0xffffff,
      roughness: 0.07,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.6,
      emissive: 0x1b4c78,
      emissiveIntensity: 0.22,
    });
    this.marbleMesh = new THREE.Mesh(geo, mat);
    this.marbleMesh.castShadow = true;
    this.scene.add(this.marbleMesh);

    // A tight rim shell. Marble Blast's marble has a dark, definite edge; a
    // lit sphere alone dissolves into whatever is behind it.
    const rim = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0x0b2036,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    rim.scale.setScalar(1.045);
    this.marbleMesh.add(rim);
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
            new THREE.CylinderGeometry(0.42, 0.42, 14, 20, 1, true),
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
          this.checkpoints.push({ mesh, pos: v3(e.pos), armed: false });
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
      for (const c of this.checkpoints) c.armed = false;
      this.lastBeat = 99;
      // The gem chime climbs as you collect; a fresh run has to start low again.
      this.audio?.resetGemPitch();
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

    if (this.phase === 'countdown') {
      // Beep on each of the last three seconds, then GO. Tracked by index so a
      // slow frame that steps past a boundary still fires it exactly once.
      const beat = Math.max(0, Math.ceil((GO_TIME - this.elapsed) / 1000));
      if (beat < this.lastBeat) {
        this.lastBeat = beat;
        if (beat <= 3) this.audio?.countdown(beat);
      }
      if (this.elapsed >= GO_TIME) this.phase = 'playing';
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
      const kind = this.marble.lastContactMaterial.kind;
      this.audio?.impact(this.marble.impactSpeed, kind);
      // Both of these self-gate at the same 2.5 m/s the audio ramps from, so
      // the particles and the sound always agree about what counted as a hit.
      this.effects.impact(
        this.marble.position,
        this.marble.groundNormal,
        this.marble.impactSpeed,
        kind,
      );
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
        this.effects.gemPop(g.pos, 0xff4fd8);
        this.audio?.gem(this.gemsCollected, this.gemsTotal);
      }
    }

    // Checkpoints arm once and never disarm, so falling back past one cannot
    // cost the player progress they already earned.
    for (const c of this.checkpoints) {
      if (c.armed) continue;
      if (p.distanceToSquared(c.pos) < (reach + 1.4) ** 2) {
        c.armed = true;
        this.checkpoint = c.pos.clone().setY(c.pos.y + this.marble.radius);
        this.effects.sparkle(c.pos, 0xffd23f);
        this.audio?.play('pickup');
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
        this.effects.timeTravel(tt.pos);
        this.audio?.play('timeTravel');
      }
    }

    if (this.endPad && this.phase === 'playing' && this.gemsCollected >= this.gemsTotal) {
      const d = p.clone().sub(this.endPad);
      // Slightly wider than the pad decal so a fast marble clipping the edge
      // still counts, but not so wide that the run ends short of the target.
      const reachXZ = 0.8;
      if (Math.abs(d.y) < 1.6 && d.x * d.x + d.z * d.z < reachXZ * reachXZ) this.finish();
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
    this.effects.powerupBurst(this.marble.position, type);
    this.audio?.powerup(type);
    this.applyModifiers();
    this.onPowerupUsed?.(type);
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
            this.effects.bumper(h.pos);
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
    this.effects.finishBurst(this.marble.position);
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

/** Push a colour toward the reference's palette: it is bold, never muted. */
function punch(hexColor: string, sat: number, light: number): THREE.Color {
  const c = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * sat), Math.min(1, hsl.l * light));
}

const hex = (c: THREE.Color) => `#${c.getHexString()}`;

/**
 * A soft additive billboard. Every pickup carries one: it is what makes a
 * 30cm object findable from the far side of a level, which is the job the
 * reference's gems do and ours did not.
 */
function makeHalo(color: number, size: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

/**
 * An eight-sided brilliant: crown, girdle, pavilion. Flat shaded, so every
 * facet takes the light separately and the gem flashes as it spins — a smooth
 * octahedron just sits there being a pink blob.
 */
function gemGeometry(r: number, h: number): THREE.BufferGeometry {
  const sides = 8;
  const pos: number[] = [];
  const push = (...ps: THREE.Vector3[]) => ps.forEach((p) => pos.push(p.x, p.y, p.z));
  const ring = (radius: number, y: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    });

  const table = ring(r * 0.42, h * 0.5);
  const crown = ring(r, h * 0.16);
  const girdle = ring(r, h * 0.06);
  const tip = new THREE.Vector3(0, -h * 0.55, 0);
  const centre = new THREE.Vector3(0, h * 0.5, 0);

  // Wound so the outward face is the front face: rings run clockwise seen from
  // above, so every triangle is listed against that.
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    push(table[j], table[i], centre);
    push(crown[j], crown[i], table[i]);
    push(table[j], crown[j], table[i]);
    push(girdle[j], girdle[i], crown[i]);
    push(crown[j], girdle[j], crown[i]);
    push(girdle[j], tip, girdle[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Shared across every gem in the level: one geometry, one material, one halo
// texture. A level can hold twenty of these and they cost one draw call each.
let gemGeo: THREE.BufferGeometry | null = null;
let gemMat: THREE.Material | null = null;

function makeGem(): THREE.Mesh {
  gemGeo ??= gemGeometry(0.26, 0.62);
  gemMat ??= new THREE.MeshStandardMaterial({
    color: 0xff40d4,
    emissive: 0xff1fb0,
    emissiveIntensity: 0.9,
    roughness: 0.05,
    metalness: 0.55,
    envMapIntensity: 3.0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(gemGeo, gemMat);
  mesh.castShadow = true;
  mesh.add(makeHalo(0xff7ae0, 0.9, 0.55));
  return mesh;
}

function makePad(color: number): THREE.Object3D {
  const group = new THREE.Group();
  const tint = new THREE.Color(color);
  const map = makePadTexture(
    color.toString(16),
    hex(tint),
    hex(tint.clone().lerp(new THREE.Color(0xffffff), 0.6)),
  );

  // The pad is a decal, not a solid: the entity position is the floor height,
  // so anything with thickness either z-fights the floor it sits on or the
  // marble sinks into it. A flat disc plus a polygon offset wins the depth
  // test outright, which is the fix rather than a cover-up.
  // Three marble diameters across, not six. At 1.15 the pad filled the bottom
  // third of the frame and the marble sitting on it read as a bead dropped on
  // a dinner plate — the protagonist has to be the biggest thing in its own
  // close-up.
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 40),
    new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: tint,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.2,
      envMapIntensity: 1.2,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.002;
  group.add(face);

  const glow = makeHalo(color, 1.35, 0.35);
  glow.position.y = 0.25;
  group.add(glow);
  return group;
}

const POWERUP_COLORS: Record<PowerupType, number> = {
  superSpeed: 0xff4a12,
  superJump: 0x18c0ff,
  superBounce: 0xc23bff,
  shockAbsorber: 0xb9c6d2,
  gyrocopter: 0x2ee87a,
  megaMarble: 0xffc400,
};

/** Glossy, self-lit plastic: the finish every pickup in the reference has. */
function pickupMaterial(color: number, emissive = 0.7): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: emissive,
    roughness: 0.15,
    metalness: 0.35,
    envMapIntensity: 2.0,
  });
}

/**
 * Powerups are told apart by shape first and colour second, the way the
 * reference does it — a ring of identical glowing balls in six tints is
 * unreadable at speed.
 */
function makePowerup(type: PowerupType): THREE.Object3D {
  const group = new THREE.Group();
  const color = POWERUP_COLORS[type];
  const mat = pickupMaterial(color);
  const add = (geo: THREE.BufferGeometry, y = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  switch (type) {
    case 'superSpeed': {
      // A tapering stack of cones: a flame, so speed reads before colour does.
      for (let i = 0; i < 3; i++) {
        add(new THREE.ConeGeometry(0.3 - i * 0.07, 0.22, 6), -0.16 + i * 0.14);
      }
      break;
    }
    case 'superJump': {
      // A coil, standing up.
      for (let i = 0; i < 4; i++) {
        add(new THREE.TorusGeometry(0.22 - i * 0.015, 0.05, 8, 16), -0.18 + i * 0.11, Math.PI / 2);
      }
      break;
    }
    case 'superBounce': {
      add(new THREE.SphereGeometry(0.26, 20, 14));
      add(new THREE.TorusGeometry(0.36, 0.035, 8, 24), 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.36, 0.035, 8, 24), 0, 0, Math.PI / 2);
      break;
    }
    case 'shockAbsorber': {
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 20), -0.16);
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 12), 0.14);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), 0.34);
      break;
    }
    case 'gyrocopter': {
      add(new THREE.SphereGeometry(0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), -0.05);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), 0.16);
      add(new THREE.BoxGeometry(0.92, 0.025, 0.09), 0.3);
      add(new THREE.BoxGeometry(0.09, 0.025, 0.92), 0.3);
      break;
    }
    case 'megaMarble': {
      add(new THREE.SphereGeometry(0.34, 22, 16));
      add(new THREE.TorusGeometry(0.4, 0.045, 8, 26), 0, Math.PI / 2);
      break;
    }
  }

  group.add(makeHalo(color, 1.1, 0.45));
  return group;
}

function makeTimeTravel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = pickupMaterial(0x2ff0a0, 0.85);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 26), mat);
  rim.castShadow = true;
  group.add(rim);
  // A clock face, so it reads as time rather than as another ring pickup.
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 26),
    new THREE.MeshStandardMaterial({
      color: 0xf2fff8,
      emissive: 0x7affd0,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  face.position.z = 0.01;
  group.add(face);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x0b2a1e, roughness: 0.5 });
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.01), handMat);
  hour.position.set(0, 0.06, 0.02);
  group.add(hour);
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.01), handMat);
  minute.position.set(0.08, 0, 0.02);
  group.add(minute);
  group.add(makeHalo(0x2ff0a0, 1.0, 0.45));
  return group;
}

function makeBumper(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.86, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6, metalness: 0.3 }),
  );
  body.position.y = -0.1;
  body.castShadow = true;
  group.add(body);
  // A hot cap over a dark skirt: the same read as a pinball bumper, which is
  // what tells the player this thing will hit back.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({
      color: 0xff7a00,
      emissive: 0xff5a00,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.2,
      envMapIntensity: 1.8,
    }),
  );
  cap.position.y = 0.02;
  cap.castShadow = true;
  group.add(cap);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.055, 8, 28),
    new THREE.MeshStandardMaterial({
      color: 0xffe27a,
      emissive: 0xffc247,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);
  return group;
}

function makeMine(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0x15171a,
      roughness: 0.35,
      metalness: 0.7,
      envMapIntensity: 1.6,
    }),
  );
  body.castShadow = true;
  group.add(body);
  // A hot band around the middle: a black sphere in a shadow is invisible,
  // and a mine you cannot see is not a hazard, it is a bug.
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.05, 8, 26),
    new THREE.MeshStandardMaterial({
      color: 0xff2a18,
      emissive: 0xff2a18,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }),
  );
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const spikeMat = new THREE.MeshStandardMaterial({
    color: 0xe8523a,
    emissive: 0x6b1408,
    emissiveIntensity: 0.6,
    roughness: 0.4,
    metalness: 0.4,
  });
  for (const dir of [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), spikeMat);
    spike.position.set(dir[0] * 0.34, dir[1] * 0.34, dir[2] * 0.34);
    spike.lookAt(new THREE.Vector3(dir[0] * 2, dir[1] * 2, dir[2] * 2));
    spike.rotateX(Math.PI / 2);
    group.add(spike);
  }
  group.add(makeHalo(0xff5533, 0.95, 0.3));
  return group;
}

function makeFan(): THREE.Object3D {
  const group = new THREE.Group();
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 0.36, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x9aa6b2,
      roughness: 0.3,
      metalness: 0.8,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
    }),
  );
  group.add(housing);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.05, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.3, metalness: 0.4 }),
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.18;
  group.add(lip);
  // Cyan blades against a warm lip: the updraught reads before you feel it.
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x2fd8ff,
    emissive: 0x0f7fa0,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.5,
  });
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), bladeMat);
    blade.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.32, 0.06, Math.sin((i / 4) * Math.PI * 2) * 0.32);
    blade.rotation.y = -(i / 4) * Math.PI * 2;
    blade.rotation.z = 0.35;
    group.add(blade);
  }
  return group;
}

function makeOilDrum(): THREE.Object3D {
  const group = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.1, 20),
    new THREE.MeshStandardMaterial({
      map: getTexture('rust'),
      roughness: 0.72,
      metalness: 0.35,
      envMapIntensity: 1.2,
    }),
  );
  drum.castShadow = drum.receiveShadow = true;
  group.add(drum);
  // Rolling hoops, which is what makes a cylinder read as a drum.
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x54301c, roughness: 0.6, metalness: 0.4 });
  for (const y of [-0.28, 0.28]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 8, 24), hoopMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    group.add(hoop);
  }
  return group;
}

function makeCheckpoint(): THREE.Object3D {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10),
    new THREE.MeshStandardMaterial({
      color: 0xdfe8f0,
      roughness: 0.25,
      metalness: 0.85,
      envMapIntensity: 1.8,
    }),
  );
  post.position.y = 0.8;
  post.castShadow = true;
  group.add(post);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.42),
    new THREE.MeshStandardMaterial({
      color: 0xffd000,
      emissive: 0xffa800,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
      roughness: 0.5,
    }),
  );
  flag.position.set(0.35, 1.35, 0);
  group.add(flag);
  const glow = makeHalo(0xffd000, 1.0, 0.3);
  glow.position.set(0.2, 1.35, 0);
  group.add(glow);
  return group;
}
