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
import { CelestialBodies } from './celestialBodies';
import { ShipExterior } from './shipExterior';

export class SpaceScene {
  readonly scene = new THREE.Scene();

  private readonly starfield: Starfield;
  private readonly bodies: CelestialBodies;
  private readonly exterior: ShipExterior;

  constructor(specs: readonly LocationSpec[], layout: ShipLayout) {
    this.starfield = new Starfield();
    this.bodies = new CelestialBodies(specs);
    this.exterior = new ShipExterior(layout);
    this.exterior.group.visible = false; // only shown in the cinematic shot

    // A cold key light plus faint fill so bodies and hull read in the dark.
    const key = new THREE.DirectionalLight(0xbfd2e8, 1.1);
    key.position.set(-0.6, 0.5, -0.3);
    this.scene.add(key, new THREE.AmbientLight(0x10141c));

    this.scene.add(this.starfield.points, this.bodies.group, this.exterior.group);
  }

  /** Advance the drift and re-place bodies (called once per fixed update). */
  update(dt: number, view: TravelView): void {
    this.starfield.update(dt, view.driftSpeed);
    this.bodies.apply(view);
    this.exterior.setEngineIntensity(view.engineIntensity);
  }

  /** Show the hull only while the cinematic exterior camera is live. */
  setExteriorVisible(visible: boolean): void {
    this.exterior.group.visible = visible;
  }

  dispose(): void {
    this.starfield.dispose();
    this.bodies.dispose();
    this.exterior.dispose();
  }
}
