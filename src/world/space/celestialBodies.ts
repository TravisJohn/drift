/**
 * CelestialBodies - what each location looks like out the window (M4, D4).
 *
 * One group per location, built from its BodySpec data. The TravelDirector's
 * presences drive where each body sits:
 *   - the current location rests off the port bow while docked, then slides
 *     astern as the ship departs (the ship never moves - space does, D2);
 *   - the destination grows from a point dead ahead while arriving.
 */
import * as THREE from 'three';
import { gameConfig } from '../../config/gameConfig';
import type { LocationSpec } from '../../content/destinations';
import type { TravelView } from '../../travel/travelDirector';
import { disposeObject3D } from '../../rendering/dispose';

/** Docked pose: off the port bow, where the lab/cryo windows look. */
const DOCKED_DIR = new THREE.Vector3(-0.62, 0.16, -0.5).normalize();
/** Where a departed body ends up: far astern. */
const ASTERN_OFFSET = new THREE.Vector3(60, -10, 520);
/** Where an arriving body starts: a point dead ahead. */
const AHEAD_POS = new THREE.Vector3(-40, 25, -760);

/** Scale floor so a "gone" body never degenerates to scale 0 (NaN quats). */
const MIN_SCALE = 0.001;

function buildBody(spec: LocationSpec): THREE.Group {
  const group = new THREE.Group();
  const { kind, radius } = spec.body;
  const color = new THREE.Color(spec.accentColor);

  if (kind === 'sun') {
    // A dying star: fully emissive, no lighting needed.
    const material = new THREE.MeshBasicMaterial({ color });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material));
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.25, 24, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }),
    );
    group.add(halo);
  } else {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0.05,
      emissive: color,
      emissiveIntensity: 0.08,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material));

    if (kind === 'ringed') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.4, radius * 2.1, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = Math.PI / 2 - 0.35;
      group.add(ring);
    }

    if (kind === 'station') {
      // Quiet gantries: two long crossed spars beside the core.
      const sparMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a4150,
        roughness: 0.8,
        metalness: 0.3,
      });
      const sparA = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 4.2, radius * 0.18, radius * 0.18),
        sparMaterial,
      );
      const sparB = sparA.clone();
      sparB.rotation.y = Math.PI / 2;
      sparB.position.y = radius * 0.5;
      group.add(sparA, sparB);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb070 }),
      );
      beacon.position.set(radius * 2.1, 0, 0);
      group.add(beacon);
    }
  }
  return group;
}

export class CelestialBodies {
  readonly group = new THREE.Group();

  private readonly byId = new Map<string, THREE.Group>();

  constructor(specs: readonly LocationSpec[]) {
    for (const spec of specs) {
      const body = buildBody(spec);
      body.visible = false;
      this.byId.set(spec.id, body);
      this.group.add(body);
    }
  }

  /** Place/scale bodies from the TravelDirector's view of the journey. */
  apply(view: TravelView): void {
    const docked = DOCKED_DIR.clone().multiplyScalar(gameConfig.space.bodyDistance);

    for (const [id, body] of this.byId) {
      let presence = 0;
      let from: THREE.Vector3 | null = null;

      if (id === view.currentBodyId && view.currentBodyPresence > 0) {
        presence = view.currentBodyPresence;
        from = docked.clone().add(ASTERN_OFFSET); // recedes astern as presence falls
      } else if (id === view.destinationBodyId && view.destinationBodyPresence > 0) {
        presence = view.destinationBodyPresence;
        from = AHEAD_POS.clone(); // grows from a point ahead
      }

      if (presence <= 0 || from === null) {
        body.visible = false;
        continue;
      }
      body.visible = true;
      body.position.copy(from.lerp(docked, presence));
      const s = Math.max(MIN_SCALE, presence);
      body.scale.setScalar(s);
    }
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
