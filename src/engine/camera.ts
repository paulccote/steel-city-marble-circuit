import * as THREE from 'three';
import type { CollisionWorld } from './collision';

/**
 * Marble Blast chase camera: a fixed-length boom behind the marble, aimed by
 * the mouse, that pulls in when geometry would clip it. Crucially the marble's
 * control axes come from this camera's yaw, so steering always means "the way
 * I am looking".
 */
const _back = new THREE.Vector3();

export const DEFAULT_PITCH = 0.45;

/** Pull the camera this far off any surface it would otherwise clip into. */
const CLIP_CLEARANCE = 0.1;

export class ChaseCamera {
  yaw = 0;
  /** Positive pitch looks down. 0.45 rad is Marble Blast's spawn pitch. */
  pitch = DEFAULT_PITCH;

  distance = 2.5;
  /**
   * Applied *after* aiming at the marble, which is what drops the marble to
   * the lower third of the frame instead of dead centre.
   */
  verticalTranslation = 0.3;

  minPitch = -Math.PI / 4;
  maxPitch = Math.PI / 2 - 1e-4;

  readonly camera: THREE.PerspectiveCamera;

  private smoothed = new THREE.Vector3();
  private hasSmoothed = false;
  private desired = new THREE.Vector3();
  private target = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);


  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.05, 800);
  }

  reset(marblePos: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.pitch = DEFAULT_PITCH;
    this.hasSmoothed = false;
    this.update(marblePos, null, 0, new THREE.Vector3(0, 1, 0));
  }

  look(dYaw: number, dPitch: number) {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, this.minPitch, this.maxPitch);
  }

  /** Forward and right on the plane perpendicular to `up`, for movement. */
  basis(up: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3) {
    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    forward.addScaledVector(up, -forward.dot(up));
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
    forward.normalize();
    right.crossVectors(forward, up).normalize().negate();
  }

  update(marblePos: THREE.Vector3, world: CollisionWorld | null, dt: number, up: THREE.Vector3) {
    this.up.copy(up);

    // Follow the marble with a light lag so the camera does not transmit every
    // bump in the geometry to the player's eyes.
    if (!this.hasSmoothed) {
      this.smoothed.copy(marblePos);
      this.hasSmoothed = true;
    } else {
      const k = 1 - Math.exp(-24 * dt);
      this.smoothed.lerp(marblePos, k);
    }

    this.target.copy(this.smoothed);

    // View direction. Positive pitch tips the view downward, which puts the
    // camera itself above and behind the marble.
    const cp = Math.cos(this.pitch);
    this.dir
      .set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp)
      .normalize();

    let dist = this.distance;
    if (world) {
      // Sweep a small sphere back along the boom; if it hits, ride just in
      // front of the impact so the camera never ends up inside a bridge deck.
      const back = _back.copy(this.dir).multiplyScalar(-dist);
      const toi = world.sweep(this.target, back, 0.2);
      if (toi >= 0) dist = Math.max(0.35, dist * toi - CLIP_CLEARANCE);
    }

    this.desired.copy(this.target).addScaledVector(this.dir, -dist);
    this.camera.position.copy(this.desired);
    this.camera.up.copy(up);
    this.camera.lookAt(this.target);

    // Raise the camera *after* aiming. The marble therefore sits low in the
    // frame and the player sees more of what is ahead of them.
    this.camera.position.addScaledVector(up, this.verticalTranslation);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
