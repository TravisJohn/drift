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
import {
  type RingMaterial,
  type SpaceUniforms,
  createGiantMaterial,
  createHaloMaterial,
  createRingMaterial,
  createSunMaterial,
} from './bodyMaterials';

/** Docked pose: off the port bow, where the lab/cryo windows look. */
const DOCKED_DIR = new THREE.Vector3(-0.62, 0.16, -0.5).normalize();
/** Where a departed body ends up: far astern. */
const ASTERN_OFFSET = new THREE.Vector3(60, -10, 520);
/** Where an arriving body starts: a point dead ahead. */
const AHEAD_POS = new THREE.Vector3(-40, 25, -760);

/** Station wheel axis: mostly facing the docked ship, tilted for depth. */
const STATION_AXIS = new THREE.Vector3(0.68, 0.49, 0.55).normalize();

/** Scale floor so a "gone" body never degenerates to scale 0 (NaN quats). */
const MIN_SCALE = 0.001;

/** One location's body plus the handles needed to animate it. */
interface Body {
  readonly group: THREE.Group;
  readonly radius: number;
  readonly berth?: THREE.Vector3;
  /** Set when the body has rings (their shadow follows the planet). */
  readonly ring: RingMaterial | null;
  /** Per-frame motion that is not a shader's job (spin, blinking). */
  animate(elapsed: number): void;
}

const SPHERE_SEGMENTS: readonly [number, number] = [64, 40];

function shell(radius: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, ...SPHERE_SEGMENTS), material);
}

/** A dying star: a boiling self-lit surface inside a wide corona. */
function buildSun(spec: LocationSpec, uniforms: SpaceUniforms): Body {
  const group = new THREE.Group();
  const { radius } = spec.body;
  const color = new THREE.Color(spec.accentColor);
  group.add(shell(radius, createSunMaterial(uniforms, color)));
  group.add(
    shell(
      radius * 1.7,
      createHaloMaterial(uniforms, color, {
        shellRatio: 1.7,
        falloff: 3.4,
        strength: 0.5,
        allAround: true,
      }),
    ),
  );
  return { group, radius, ring: null, animate: () => undefined };
}

/** An ice giant: banded surface, thin atmosphere, shadowed rings. */
function buildRinged(spec: LocationSpec, uniforms: SpaceUniforms): Body {
  const group = new THREE.Group();
  const { radius } = spec.body;
  const color = new THREE.Color(spec.accentColor);
  group.add(shell(radius, createGiantMaterial(uniforms, color)));
  group.add(
    shell(
      radius * 1.12,
      createHaloMaterial(uniforms, color.clone().lerp(new THREE.Color(1, 1, 1), 0.3), {
        shellRatio: 1.12,
        falloff: 2.2,
        strength: 0.55,
        allAround: false,
      }),
    ),
  );

  const [inner, outer] = [1.35, 2.25];
  const ring = createRingMaterial(
    uniforms,
    color.clone().lerp(new THREE.Color(1, 1, 1), 0.45),
    inner,
    outer,
  );
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * inner, radius * outer, 128),
    ring,
  );
  ringMesh.rotation.x = Math.PI / 2 - 0.35;
  ringMesh.rotation.y = 0.18;
  group.add(ringMesh);
  return { group, radius, ring, animate: () => undefined };
}

/** A mooring station: hub, slowly turning habitat ring, solar wings. */
function buildStation(spec: LocationSpec): Body {
  const derelict = spec.body.kind === 'derelict';
  const group = new THREE.Group();
  const { radius } = spec.body;
  const hull = new THREE.MeshStandardMaterial({
    color: derelict ? 0x936d5d : 0x8a94a3,
    roughness: 0.55,
    metalness: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.7, metalness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({
    color: 0x16264a,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x0a1a3a,
    emissiveIntensity: derelict ? 0.08 : 0.6,
  });
  // Brighter than white on purpose: lit windows and beacons should bloom.
  const windowGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.0) });
  const beaconGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.3, 0.5) });

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 1.7, 20),
    hull,
  );
  const hubCap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.38, radius * 0.38, radius * 0.25, 20),
    dark,
  );
  group.add(hub, hubCap);

  // Habitat ring with spokes and a run of lit windows; this part turns.
  const wheel = new THREE.Group();
  const ringRadius = radius * 1.5;
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(
      ringRadius,
      radius * 0.14,
      12,
      64,
      derelict ? Math.PI * 1.52 : Math.PI * 2,
    ),
    hull,
  );
  torus.rotation.x = Math.PI / 2;
  wheel.add(torus);
  const spokeGeometry = new THREE.BoxGeometry(ringRadius * 2, radius * 0.07, radius * 0.07);
  for (let i = 0; i < 2; i++) {
    const spoke = new THREE.Mesh(spokeGeometry, dark);
    spoke.rotation.y = (i * Math.PI) / 2;
    wheel.add(spoke);
  }
  const windowGeometry = new THREE.BoxGeometry(radius * 0.07, radius * 0.035, radius * 0.02);
  const WINDOW_COUNT = derelict ? 0 : 36;
  for (let i = 0; i < WINDOW_COUNT; i++) {
    if (i % 6 === 5) continue; // gaps make it read as rooms, not a stripe
    const angle = (i / WINDOW_COUNT) * Math.PI * 2;
    const light = new THREE.Mesh(windowGeometry, windowGlow);
    const r = ringRadius + radius * 0.141;
    light.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    light.rotation.y = Math.PI / 2 - angle;
    wheel.add(light);
  }
  group.add(wheel);

  // Solar wings on a boom above the wheel.
  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 5.4, radius * 0.06, radius * 0.06),
    dark,
  );
  boom.position.y = radius * 0.95;
  group.add(boom);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 1.7, radius * 0.02, radius * 0.85),
      panel,
    );
    wing.position.set(side * radius * 1.95, radius * 0.95, 0);
    wing.rotation.x = 0.5;
    if (derelict && side === 1) {
      wing.scale.x = 0.48;
      wing.rotation.z = -0.72;
      wing.position.set(radius * 1.4, radius * 0.69, 0);
    }
    group.add(wing);
  }

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.07, 10, 8), beaconGlow);
  beacon.position.y = -radius * 0.95;
  group.add(beacon);

  // Tip the wheel's axis toward the docked ship so it reads as a wheel,
  // not as a line seen edge-on.
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), STATION_AXIS);
  return {
    group,
    radius,
    // The abandoned relay is directly visible through the bridge viewport.
    berth: derelict ? new THREE.Vector3(-0.12, 0.035, -1).normalize() : DOCKED_DIR,
    ring: null,
    animate(elapsed) {
      wheel.rotation.y = derelict ? 0.42 : elapsed * 0.05;
      // A slow service blink: mostly dark, a short pulse every few seconds.
      beacon.visible = elapsed % 3.2 < 0.35;
    },
  };
}

function buildBody(spec: LocationSpec, uniforms: SpaceUniforms): Body {
  switch (spec.body.kind) {
    case 'sun':
      return buildSun(spec, uniforms);
    case 'ringed':
      return buildRinged(spec, uniforms);
    case 'derelict':
    case 'station':
      return buildStation(spec);
  }
}

export class CelestialBodies {
  readonly group = new THREE.Group();

  private readonly byId = new Map<string, Body>();

  constructor(
    specs: readonly LocationSpec[],
    private readonly uniforms: SpaceUniforms,
  ) {
    for (const spec of specs) {
      const body = buildBody(spec, uniforms);
      body.group.visible = false;
      this.byId.set(spec.id, body);
      this.group.add(body.group);
    }
  }

  /** Advance surface animation, spin and blinking. `elapsed` is seconds. */
  update(elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
    for (const body of this.byId.values()) body.animate(elapsed);
  }

  /** Place/scale bodies from the TravelDirector's view of the journey. */
  apply(view: TravelView): void {
    for (const [id, body] of this.byId) {
      const docked = (body.berth ?? DOCKED_DIR)
        .clone()
        .multiplyScalar(gameConfig.space.bodyDistance);
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
        body.group.visible = false;
        continue;
      }
      body.group.visible = true;
      body.group.position.copy(from.lerp(docked, presence));
      const s = Math.max(MIN_SCALE, presence);
      body.group.scale.setScalar(s);
      if (body.ring) {
        // The ring shader shadows itself against the planet where it is now.
        body.ring.uniforms.uBodyCenter.value.copy(body.group.position);
        body.ring.uniforms.uBodyRadius.value = body.radius * s;
      }
    }
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
