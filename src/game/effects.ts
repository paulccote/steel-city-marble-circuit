import * as THREE from 'three';
import type { Marble } from '../engine/physics';

/**
 * A single pooled particle system for every effect in the game. One draw call
 * for sparks, dust, explosions and the speed trail keeps the cost invisible
 * next to the scene geometry.
 */

const MAX_PARTICLES = 900;

interface Particle {
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  gravity: number;
  size: number;
}

export class Effects {
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: Particle[] = [];
  private cursor = 0;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        life: 0,
        maxLife: 1,
        vel: new THREE.Vector3(),
        gravity: 0,
        size: 1,
      });
      // Park dead particles far away rather than branching in the shader.
      this.positions[i * 3 + 1] = -9999;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: window.innerHeight / 2 } },
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
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float a = 1.0 - smoothstep(0.2, 0.5, length(d));
          if (a <= 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: THREE.Color,
    life: number,
    size: number,
    gravity: number,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const p = this.particles[i];
    p.life = life;
    p.maxLife = life;
    p.vel.copy(vel);
    p.gravity = gravity;
    p.size = size;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
  }

  /** Dust kicked up on a hard landing. */
  burst(pos: THREE.Vector3, normal: THREE.Vector3) {
    const color = new THREE.Color(0xd8d2c4);
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 3,
      ).addScaledVector(normal, 1.2);
      this.spawn(pos, v, color, 0.45 + Math.random() * 0.3, 0.06, -3);
    }
  }

  sparkle(pos: THREE.Vector3, hex: number) {
    const color = new THREE.Color(hex);
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4,
        (Math.random() - 0.5) * 5,
      );
      this.spawn(pos, v, color, 0.5 + Math.random() * 0.4, 0.07, -6);
    }
  }

  explosion(pos: THREE.Vector3) {
    const hot = new THREE.Color(0xffb03a);
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 8,
        (Math.random() - 0.5) * 12,
      );
      this.spawn(pos, v, hot, 0.4 + Math.random() * 0.5, 0.12, -8);
    }
  }

  private trailTimer = 0;

  update(dt: number, marble: Marble) {
    // A speed trail only above the threshold where Marble Blast shows one, so
    // it reads as "you are going fast" rather than as constant decoration.
    const speed = marble.velocity.length();
    this.trailTimer -= dt;
    if (speed > 10 && this.trailTimer <= 0) {
      this.trailTimer = 0.02;
      const c = new THREE.Color().setHSL(0.55, 0.8, 0.7);
      this.tmp.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
      this.spawn(marble.position, this.tmp, c, 0.35, 0.09, 0);
    }

    // Rolling dust proportional to how much the marble is scrubbing.
    if (marble.onGround && marble.slipSpeed > 6) {
      this.tmp
        .set((Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5)
        .addScaledVector(marble.groundNormal, 0.6);
      this.spawn(
        marble.position.clone().addScaledVector(marble.groundNormal, -marble.radius),
        this.tmp,
        new THREE.Color(0xcfc9bb),
        0.3,
        0.05,
        -2,
      );
    }

    const pos = this.positions;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        pos[i * 3 + 1] = -9999;
        this.sizes[i] = 0;
        continue;
      }
      p.vel.y += p.gravity * dt;
      pos[i * 3] += p.vel.x * dt;
      pos[i * 3 + 1] += p.vel.y * dt;
      pos[i * 3 + 2] += p.vel.z * dt;
      // Shrink as they die so they fade out of the frame cleanly.
      this.sizes[i] = p.size * (p.life / p.maxLife);
    }

    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
  }
}
