/**
 * DroneVisual - placeholder look for the maintenance drone (replaced by a
 * CC0 model in M6). A rounded body with a sensor "eye" and a soft cyan
 * glow light, nose pointing -Z to match DroneController's yaw convention.
 */
import * as THREE from 'three';
import type { DroneSnapshot } from './droneController';
import { lerp } from '../physics/vec3';
import { disposeObject3D } from '../rendering/dispose';

/** Height above the deck at which the ground shadow has faded out. */
const SHADOW_FADE_HEIGHT = 2.6;

const SHADOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.0, 1.0, d)) * uStrength;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

/**
 * How dark the ground shadow is for a drone `height` above the deck:
 * strongest when it skims the floor, gone by SHADOW_FADE_HEIGHT.
 */
export function groundShadowStrength(height: number): number {
  const t = 1 - Math.min(1, Math.max(0, height / SHADOW_FADE_HEIGHT));
  return 0.55 * t * t;
}

export class DroneVisual {
  readonly group: THREE.Group;
  /**
   * A soft dark patch on the deck under the drone. The room shadows are
   * drawn once at startup, so the one thing that moves needs its own - and
   * without it a hovering object looks pasted onto the picture. Add it to
   * the scene beside `group` (it must not tilt or bob with the drone).
   */
  readonly groundShadow: THREE.Mesh;
  private readonly groundShadowMaterial: THREE.ShaderMaterial;
  private readonly glow: THREE.PointLight;

  constructor() {
    this.group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.5, metalness: 0.55 }),
    );
    body.scale.set(1, 0.75, 1.15);
    this.group.add(body);

    // Sensor eye on the nose (-Z).
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x111418,
        emissive: 0x33e0ff,
        emissiveIntensity: 1.6,
        roughness: 0.3,
      }),
    );
    eye.position.set(0, 0.02, -0.22);
    this.group.add(eye);

    // Thin equator ring, slightly metallic.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.025, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x6b7683, roughness: 0.35, metalness: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Soft glow so the drone reads in dim rooms and lights nearby walls.
    this.glow = new THREE.PointLight(0x55d5ff, 0.9, 4, 2);
    this.glow.position.set(0, -0.05, 0);
    this.group.add(this.glow);

    // Headlight (M6): a small forward pool of light - the drone's own
    // company in dark corners. Target parented so it steers with the nose.
    const headlight = new THREE.SpotLight(0xbfe8ff, 6, 9, 0.5, 0.55, 1.2);
    headlight.position.set(0, 0, -0.18);
    headlight.target.position.set(0, -0.6, -4);
    this.group.add(headlight, headlight.target);

    this.groundShadowMaterial = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 } },
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.groundShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      this.groundShadowMaterial,
    );
    this.groundShadow.rotation.x = -Math.PI / 2;
  }

  /** Apply controller state; `alpha` interpolates between fixed steps. */
  apply(snapshot: DroneSnapshot, alpha: number): void {
    const p = lerp(snapshot.prevPosition, snapshot.position, alpha);
    this.group.position.set(p.x, p.y + snapshot.bobOffset, p.z);
    this.group.rotation.set(snapshot.leanPitch, snapshot.yaw, snapshot.leanRoll, 'YXZ');
    // Just above the deck (y = 0) so it never fights the floor for depth.
    this.groundShadow.position.set(p.x, 0.012, p.z);
    this.groundShadowMaterial.uniforms.uStrength!.value = groundShadowStrength(p.y);
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.groundShadow.geometry.dispose();
    this.groundShadowMaterial.dispose();
  }
}
