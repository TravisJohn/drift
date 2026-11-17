/**
 * SpaceScene - everything outside the windows (M4, D2).
 *
 * Rendered first each frame from a camera that only copies the interior
 * camera's rotation (position stays at the origin), then the interior is
 * drawn on top with depth cleared - so space shows through the window
 * openings. The ship never moves: the TravelDirector's view drives the
 * starfield drift and the celestial bodies instead.
 */
import * as THREE from 'three';
import type { LocationSpec } from '../../content/destinations';
import type { ShipLayout } from '../../content/shipLayout';
import type { TravelView } from '../../travel/travelDirector';
import { Starfield } from './starfield';
import { SkyDome } from './skyDome';
import { CelestialBodies } from './celestialBodies';
import { ShipExterior } from './shipExterior';
import { createSpaceUniforms } from './bodyMaterials';
import { projectionScale } from './starLook';

/**
 * Where the key light sits. Chosen so a docked body, seen from the ship,
 * shows a little over half its lit face with the terminator in view.
 */
const KEY_LIGHT_DIRECTION = new THREE.Vector3(0.75, 0.45, -0.5).normalize();

export class SpaceScene {
  readonly scene = new THREE.Scene();

  private readonly sky: SkyDome;
  private readonly starfield: Starfield;
  private elapsed = 0;
  private readonly bodies: CelestialBodies;
  private readonly exterior: ShipExterior;

  constructor(specs: readonly LocationSpec[], layout: ShipLayout) {
    this.sky = new SkyDome();
    this.starfield = new Starfield();
    this.bodies = new CelestialBodies(specs, createSpaceUniforms(KEY_LIGHT_DIRECTION));
    this.exterior = new ShipExterior(layout);
    this.exterior.group.visible = false; // only shown in the cinematic shot

    // A cold key light plus faint fill so bodies and hull read in the dark.
    const key = new THREE.DirectionalLight(0xdfe8f5, 3.0);
    key.position.copy(KEY_LIGHT_DIRECTION);
    this.scene.add(key, new THREE.AmbientLight(0x1a2030, 1.2));

    this.scene.add(this.sky.group, this.starfield.points, this.bodies.group, this.exterior.group);
  }

  /**
   * One-off startup work that needs the renderer: paint the static nebula
   * into the scene background (see SkyDome.bakeNebula).
   */
  prepare(renderer: THREE.WebGLRenderer): void {
    this.scene.background = this.sky.bakeNebula(renderer);
  }

  /** Keep star sizes true to the viewport; call on every resize. */
  setViewport(heightPx: number, fovDegrees: number): void {
    const scale = projectionScale(heightPx, fovDegrees);
    this.sky.setProjectionScale(scale);
    this.starfield.setProjectionScale(scale);
  }

  /** Advance the drift and re-place bodies (called once per fixed update). */
  update(dt: number, view: TravelView): void {
    this.elapsed += dt;
    this.sky.update(this.elapsed);
    this.starfield.update(dt, view.driftSpeed, this.elapsed);
    this.bodies.update(this.elapsed);
    this.bodies.apply(view);
    this.exterior.setEngineIntensity(view.engineIntensity);
    if (this.exterior.group.visible) this.exterior.update(this.elapsed);
  }

  /** Show the hull only while the cinematic exterior camera is live. */
  setExteriorVisible(visible: boolean): void {
    this.exterior.group.visible = visible;
  }

  dispose(): void {
    this.sky.dispose();
    this.starfield.dispose();
    this.bodies.dispose();
    this.exterior.dispose();
  }
}
