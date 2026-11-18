/**
 * DroneVisual - the maintenance drone on screen.
 *
 * Puts the model from droneModel.ts where the controller says the drone
 * is, and brings it to life each frame with the values from
 * droneAnimation.ts: the eye blinks and glances into turns, the thrusters
 * tilt and glow harder with speed, and the antenna beacon flashes. Near
 * the tether limit the beacon turns red and flashes with the alarm beat
 * (WarningBeat), inside a small red glow.
 * Nose points -Z to match DroneController's yaw convention.
 */
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { DroneSnapshot } from './droneController';
import {
  beaconLevel,
  blinkAmount,
  exhaustIntensity,
  eyeOffset,
  thrustLevel,
  thrusterTilt,
} from './droneAnimation';
import { type DroneModel, buildDroneModel } from './droneModel';
import { lerp } from '../physics/vec3';
import { disposeObject3D } from '../rendering/dispose';

/** Height above the deck at which the ground shadow has faded out. */
const SHADOW_FADE_HEIGHT = 2.6;
/** How far a blink squashes the eye: a little light always shows. */
const BLINK_DEPTH = 0.92;
/** Speed (m/s) below which the drone counts as still, for the idle gaze. */
const IDLE_SPEED = 0.6;

// Warning glow round the antenna beacon: a small soft red sphere, brightest
// at its centre and fading to nothing at its rim, so it reads as glow.
const HALO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    gl_FragColor = vec4(uColor * pow(facing, 4.0) * uLevel, 1.0);
  }
`;

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
  private readonly model: DroneModel;
  private readonly glow: THREE.PointLight;
  private readonly glowBase: number;
  private readonly halo: THREE.Mesh;
  private readonly haloMaterial: THREE.ShaderMaterial;
  /** Normal and warning beacon colours, so the warning can blend between them. */
  private readonly beaconColor = new THREE.Color(gameConfig.droneLook.beaconColor);
  private readonly warningColor = new THREE.Color(gameConfig.droneLook.warningColor);

  constructor() {
    this.model = buildDroneModel();
    this.group = this.model.root;

    // Hover glow under the belly: lights the deck beneath the drone and
    // brightens with thrust. Two lights in all, as before the new model -
    // every light adds cost to every lit surface in the ship.
    this.glowBase = 0.9;
    this.glow = new THREE.PointLight(gameConfig.droneLook.exhaustColor, this.glowBase, 4, 2);
    this.glow.position.set(0, -0.2, 0);
    this.group.add(this.glow);

    // Headlight from the eye: a small forward pool of light - the drone's
    // own company in dark corners. Target parented so it steers with the nose.
    const headlight = new THREE.SpotLight(0xbfe8ff, 6, 9, 0.5, 0.55, 1.2);
    headlight.position.copy(this.model.eyeRest);
    headlight.target.position.set(0, -0.6, -4);
    this.group.add(headlight, headlight.target);

    // Hidden until the tether strains; additive, so it only ever adds light.
    this.haloMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(gameConfig.droneLook.warningColor) },
        uLevel: { value: 0 },
      },
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(gameConfig.droneLook.warningHaloRadius, 24, 16),
      this.haloMaterial,
    );
    this.halo.position.copy(this.model.beaconPosition);
    this.halo.visible = false;
    this.group.add(this.halo);

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

  /**
   * Apply controller state; `alpha` interpolates between fixed steps and
   * `time` (seconds, any steady clock) drives blinking and the beacon.
   * `warningFlash` (0..1) is the tether alarm beat from WarningBeat.
   */
  apply(snapshot: DroneSnapshot, alpha: number, time: number, warningFlash = 0): void {
    const p = lerp(snapshot.prevPosition, snapshot.position, alpha);
    this.group.position.set(p.x, p.y + snapshot.bobOffset, p.z);
    this.group.rotation.set(snapshot.leanPitch, snapshot.yaw, snapshot.leanRoll, 'YXZ');
    // Just above the deck (y = 0) so it never fights the floor for depth.
    this.groundShadow.position.set(p.x, 0.012, p.z);
    this.groundShadowMaterial.uniforms.uStrength!.value = groundShadowStrength(p.y);

    this.animateParts(snapshot, time);
    this.applyWarning(snapshot.tetherStrain, warningFlash);
  }

  private animateParts(snapshot: DroneSnapshot, time: number): void {
    const { model } = this;
    const level = thrustLevel(snapshot.velocity);

    const tilt = thrusterTilt(snapshot.velocity, snapshot.yaw);
    for (const thruster of model.thrusters) thruster.rotation.set(tilt.pitch, 0, tilt.roll);
    model.exhaustMaterial.emissiveIntensity = exhaustIntensity(level);
    this.glow.intensity = this.glowBase * (0.8 + 0.5 * level);

    const speed = level * gameConfig.drone.maxSpeed;
    const idle = Math.max(0, 1 - speed / IDLE_SPEED);
    const offset = eyeOffset(time, snapshot.leanRoll, idle);
    model.eye.position.set(model.eyeRest.x + offset.x, model.eyeRest.y + offset.y, model.eyeRest.z);
    model.eye.scale.y = 1 - BLINK_DEPTH * blinkAmount(time);

    const look = gameConfig.droneLook;
    model.beaconMaterial.emissiveIntensity =
      look.beaconRest + (look.beaconPeak - look.beaconRest) * beaconLevel(time);
  }

  /**
   * Tether warning, on the antenna only: while the drone strains at its
   * tether the beacon is red, flashing bright on each alarm beat inside a
   * small red glow. With no strain the beacon keeps its normal flash.
   */
  private applyWarning(strain: number, flash: number): void {
    const look = gameConfig.droneLook;
    const { beaconMaterial } = this.model;
    const warning = strain > 0;
    beaconMaterial.emissive.copy(warning ? this.warningColor : this.beaconColor);
    if (warning) {
      beaconMaterial.emissiveIntensity =
        look.beaconPeak * (0.35 + strain * 0.3 + look.warningBeaconBoost * flash);
    }
    this.halo.visible = warning;
    this.haloMaterial.uniforms.uLevel!.value = look.warningHaloStrength * (0.2 * strain + flash);
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.groundShadow.geometry.dispose();
    this.groundShadowMaterial.dispose();
  }
}
