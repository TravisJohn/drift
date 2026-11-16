/**
 * ShipHologram - the vessel drawn in light: every compartment as a glowing
 * outline, built from the same layout data as the real ship, so the
 * hologram can never disagree with it.
 *
 * It floats small over the bridge holo-table, and is shown large in front
 * of the view while the dashboard is open. One compartment can be
 * highlighted, and a marker shows where the drone is right now.
 */
import * as THREE from 'three';
import type { ShipLayout } from '../../content/shipLayout';
import { type Vec3, vec3 } from '../../physics/vec3';

/** One compartment of the hologram, relative to the ship's centre. */
export interface HologramRoom {
  readonly id: string;
  readonly center: Vec3;
  readonly size: Vec3;
}

export interface HologramPlacement {
  readonly position: Vec3;
  /** Hologram metres per ship metre. */
  readonly scale: number;
  /** Lean toward the viewer, radians (0 = level, like a floor plan seen edge-on). */
  readonly tilt: number;
}

/** The point the hologram is built around: the middle of the deck plan. */
export function shipCentre(layout: ShipLayout): Vec3 {
  if (layout.rooms.length === 0) {
    throw new Error('shipCentre: layout has no rooms');
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const room of layout.rooms) {
    minX = Math.min(minX, room.minX);
    maxX = Math.max(maxX, room.maxX);
    minZ = Math.min(minZ, room.minZ);
    maxZ = Math.max(maxZ, room.maxZ);
  }
  return vec3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
}

/** Every room as a box around the ship's centre. Pure. */
export function hologramRooms(layout: ShipLayout): HologramRoom[] {
  const centre = shipCentre(layout);
  return layout.rooms.map((room) => ({
    id: room.id,
    center: vec3(
      (room.minX + room.maxX) / 2 - centre.x,
      layout.ceilingHeight / 2,
      (room.minZ + room.maxZ) / 2 - centre.z,
    ),
    size: vec3(room.maxX - room.minX, layout.ceilingHeight, room.maxZ - room.minZ),
  }));
}

// Brighter than white on purpose: holograms should bloom.
const LINE_COLOR = new THREE.Color(0.22, 0.95, 1.4);
const LINE_HIGHLIGHT = new THREE.Color(1.9, 1.5, 0.75);
const PLATE_COLOR = new THREE.Color(0.1, 0.55, 0.8);
const PLATE_HIGHLIGHT = new THREE.Color(1.0, 0.75, 0.3);
const MARKER_COLOR = new THREE.Color(2.4, 1.2, 0.4);
const SPIN_RATE = 0.12;

interface RoomParts {
  readonly lines: THREE.LineBasicMaterial;
  readonly plate: THREE.MeshBasicMaterial;
}

export class ShipHologram {
  readonly group = new THREE.Group();

  private readonly spin = new THREE.Group();
  private readonly rooms = new Map<string, RoomParts>();
  private readonly marker: THREE.Mesh;
  private readonly centre: Vec3;
  private highlighted: string | null = null;

  constructor(layout: ShipLayout) {
    this.centre = shipCentre(layout);
    for (const room of hologramRooms(layout)) {
      const lines = new THREE.LineBasicMaterial({
        color: LINE_COLOR.clone(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const plate = new THREE.MeshBasicMaterial({
        color: PLATE_COLOR.clone(),
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const box = new THREE.BoxGeometry(room.size.x, room.size.y, room.size.z);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(box), lines);
      box.dispose(); // only its edges are kept
      outline.position.set(room.center.x, room.center.y, room.center.z);

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.size.x, room.size.z), plate);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(room.center.x, 0.02, room.center.z);

      this.spin.add(outline, floor);
      this.rooms.set(room.id, { lines, plate });
    }

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 8),
      new THREE.MeshBasicMaterial({ color: MARKER_COLOR }),
    );
    this.spin.add(this.marker);
    this.group.add(this.spin);
  }

  /** Where the hologram floats, how big, and how far it leans. */
  setPlacement(placement: HologramPlacement): void {
    this.group.position.set(placement.position.x, placement.position.y, placement.position.z);
    this.group.scale.setScalar(placement.scale);
    this.group.rotation.x = placement.tilt;
  }

  /** Light one compartment up; null clears it. Unknown ids are an error. */
  setHighlight(roomId: string | null): void {
    if (roomId !== null && !this.rooms.has(roomId)) {
      throw new Error(`ShipHologram: no compartment "${roomId}" to highlight`);
    }
    this.highlighted = roomId;
    for (const [id, parts] of this.rooms) {
      const on = id === roomId;
      parts.lines.color.copy(on ? LINE_HIGHLIGHT : LINE_COLOR);
      parts.plate.color.copy(on ? PLATE_HIGHLIGHT : PLATE_COLOR);
      parts.plate.opacity = on ? 0.38 : 0.1;
    }
  }

  get highlightedRoom(): string | null {
    return this.highlighted;
  }

  /** Show the drone's real position inside the hologram. */
  setMarker(worldPosition: Vec3): void {
    this.marker.position.set(
      worldPosition.x - this.centre.x,
      worldPosition.y,
      worldPosition.z - this.centre.z,
    );
  }

  /** Slow turn, a breath of flicker, and a pulsing marker. */
  update(elapsed: number): void {
    this.spin.rotation.y = elapsed * SPIN_RATE;
    const flicker = 0.9 + 0.1 * Math.sin(elapsed * 11.3) * Math.sin(elapsed * 2.1);
    for (const parts of this.rooms.values()) parts.lines.opacity = flicker;
    this.marker.scale.setScalar(1 + 0.3 * Math.sin(elapsed * 4));
  }

  dispose(): void {
    this.group.traverse((object) => {
      const drawable = object as THREE.Mesh;
      drawable.geometry?.dispose();
      (drawable.material as THREE.Material | undefined)?.dispose();
    });
  }
}
