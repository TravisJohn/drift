/**
 * shipBuilder - turns the ship layout data into renderable meshes and
 * physics colliders (D4: content is data, not code).
 *
 * Meshes and colliders are generated from the same box list, so visuals and
 * collision cannot drift apart. Walls are built once per shared edge (with a
 * door opening when one is declared) and per exterior span (with window
 * openings); windows are real holes in the hull - the space scene (M4) will
 * show through them.
 */
import * as THREE from 'three';
import type { PropKind, RoomSpec, ShipLayout } from '../../content/shipLayout';
import { type BoxCollider, boxFromCenterSize } from '../../physics/colliders';
import { type Vec3, vec3 } from '../../physics/vec3';
import { disposeObject3D } from '../../rendering/dispose';
import {
  type Interval,
  type WallOpening,
  exteriorSpans,
  segmentWall,
  sharedEdge,
} from './layoutGeometry';
import { validateLayout } from './validateLayout';
import { buildPropVisual, type GlowPulse } from './propVisuals';

/** One axis-aligned box with a material role. */
export interface ShipBox {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly role: 'floor' | 'ceiling' | 'wall' | PropKind;
}

const COLORS: Record<ShipBox['role'], number> = {
  floor: 0x343a42,
  ceiling: 0x2e3540,
  wall: 0x3d434d,
  crate: 0x4a5261,
  console: 0x3b4b5e,
  pod: 0x5a6a78,
  machine: 0x55493f,
  seat: 0x47505c,
};

/** Per-room ceiling light colors - first mood pass, refined in M6. */
const ROOM_LIGHT: Record<string, number> = {
  bridge: 0x9fc0e8,
  corridor: 0xcfd8e3,
  lab: 0xd8e6d8,
  cargo: 0xe8d8b8,
  cryo: 0x7fd4e8,
  engineering: 0xffb070,
};

/** Pure part: compute every box of the ship from the layout. */
export function buildShipBoxes(layout: ShipLayout): ShipBox[] {
  const boxes: ShipBox[] = [];
  const t = layout.wallThickness;
  const H = layout.ceilingHeight;

  // --- Floors and ceilings, per room ---
  for (const room of layout.rooms) {
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;
    boxes.push({ center: vec3(cx, -t / 2, cz), size: vec3(w + t, t, d + t), role: 'floor' });
    boxes.push({ center: vec3(cx, H + t / 2, cz), size: vec3(w + t, t, d + t), role: 'ceiling' });
  }

  // --- Interior walls: one per shared edge, with a door when declared ---
  const doorKey = (a: string, b: string): string => [a, b].sort().join('|');
  const doors = new Set(layout.doors.map((d) => doorKey(d.rooms[0], d.rooms[1])));

  const emitWall = (axis: 'x' | 'z', at: number, span: Interval, openings: WallOpening[]): void => {
    for (const piece of segmentWall(span, H, openings)) {
      const mid = (piece.start + piece.end) / 2;
      const len = piece.end - piece.start;
      const height = piece.top - piece.bottom;
      const y = piece.bottom + height / 2;
      boxes.push(
        axis === 'x'
          ? { center: vec3(mid, y, at), size: vec3(len, height, t), role: 'wall' }
          : { center: vec3(at, y, mid), size: vec3(t, height, len), role: 'wall' },
      );
    }
  };

  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i] as RoomSpec;
      const b = layout.rooms[j] as RoomSpec;
      const edge = sharedEdge(a, b);
      if (!edge) continue;
      const openings: WallOpening[] = [];
      if (doors.has(doorKey(a.id, b.id))) {
        openings.push({
          center: (edge.span.start + edge.span.end) / 2,
          width: layout.doorWidth,
          bottom: 0,
          top: layout.doorHeight,
        });
      }
      emitWall(edge.axis, edge.at, edge.span, openings);
    }
  }

  // --- Hull walls: exterior spans per room side, with windows ---
  const sides = ['north', 'south', 'east', 'west'] as const;
  for (const room of layout.rooms) {
    for (const side of sides) {
      const spans = exteriorSpans(room, side, layout.rooms);
      if (spans.length === 0) continue;
      const axis = side === 'north' || side === 'south' ? 'x' : 'z';
      const at =
        side === 'north'
          ? room.minZ
          : side === 'south'
            ? room.maxZ
            : side === 'west'
              ? room.minX
              : room.maxX;
      const windows = layout.windows.filter((w) => w.roomId === room.id && w.side === side);
      for (const span of spans) {
        const openings: WallOpening[] = windows
          .filter((w) => w.center > span.start && w.center < span.end)
          .map((w) => ({
            center: w.center,
            width: w.width,
            bottom: layout.windowBottom,
            top: layout.windowTop,
          }));
        emitWall(axis, at, span, openings);
      }
    }
  }

  // --- Props ---
  for (const prop of layout.props) {
    boxes.push({ center: prop.center, size: prop.size, role: prop.kind });
  }

  return boxes;
}

export interface ShipWorld {
  readonly group: THREE.Group;
  readonly colliders: readonly BoxCollider[];
  readonly spawn: Vec3;
  /** Animate breathing glows and light flicker. `elapsed` is seconds. */
  update(elapsed: number): void;
  dispose(): void;
}

/** A light whose intensity wavers slightly (engineering's tired fixture). */
interface Flicker {
  readonly light: THREE.PointLight;
  readonly base: number;
}

/** Build the renderable ship. Throws on invalid layout content (fail loud). */
export function buildShip(layout: ShipLayout): ShipWorld {
  const problems = validateLayout(layout);
  if (problems.length > 0) {
    throw new Error(`Ship layout is invalid:\n- ${problems.join('\n- ')}`);
  }

  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];

  const materials = new Map<ShipBox['role'], THREE.MeshStandardMaterial>();
  const materialFor = (role: ShipBox['role']): THREE.MeshStandardMaterial => {
    let m = materials.get(role);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: COLORS[role],
        roughness: role === 'pod' ? 0.4 : 0.85,
        metalness: role === 'pod' || role === 'console' ? 0.4 : 0.1,
        ...(role === 'pod' ? { emissive: 0x16424e, emissiveIntensity: 0.7 } : {}),
      });
      materials.set(role, m);
    }
    return m;
  };

  const pulses: GlowPulse[] = [];
  const flickers: Flicker[] = [];

  // Colliders come from the full box list (the source of truth); structure
  // boxes also become plain meshes, while props get detailed visuals (M6)
  // that stay inside the same collider footprint.
  for (const box of buildShipBoxes(layout)) {
    colliders.push(boxFromCenterSize(box.center, box.size));
    if (box.role !== 'floor' && box.role !== 'ceiling' && box.role !== 'wall') continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z),
      materialFor(box.role),
    );
    mesh.position.set(box.center.x, box.center.y, box.center.z);
    group.add(mesh);
  }

  layout.props.forEach((prop, index) => {
    const visual = buildPropVisual(prop.kind, prop.size, index * 1.7);
    visual.group.position.set(prop.center.x, prop.center.y, prop.center.z);
    group.add(visual.group);
    pulses.push(...visual.pulses);
  });

  // --- Lighting: a ceiling light per room + a dim ambient base ---
  group.add(new THREE.AmbientLight(0x1c2432, 1.1));
  for (const room of layout.rooms) {
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const reach = Math.max(w, d) * 1.4;
    const lightColor = ROOM_LIGHT[room.id] ?? 0xcfd8e3;
    const light = new THREE.PointLight(lightColor, 14, reach, 1.6);
    light.position.set(cx, layout.ceilingHeight - 0.25, cz);
    group.add(light);

    // Engineering's fixture is old and tired: it wavers, slightly (M6).
    if (room.id === 'engineering') {
      flickers.push({ light, base: light.intensity });
    }

    // Ceiling light strip: a visible source for the room's glow (M6).
    const along = d >= w ? 'z' : 'x';
    const stripLength = (along === 'z' ? d : w) * 0.55;
    const stripMaterial = new THREE.MeshStandardMaterial({
      color: 0x10151c,
      emissive: lightColor,
      emissiveIntensity: 1.5,
      roughness: 0.4,
    });
    const strip = new THREE.Mesh(
      along === 'z'
        ? new THREE.BoxGeometry(0.22, 0.05, stripLength)
        : new THREE.BoxGeometry(stripLength, 0.05, 0.22),
      stripMaterial,
    );
    strip.position.set(cx, layout.ceilingHeight - 0.03, cz);
    group.add(strip);
    if (room.id === 'cryo') {
      // The cryo bay's strip breathes with the pods.
      pulses.push({
        material: stripMaterial,
        base: 1.4,
        amplitude: 0.3,
        frequency: 0.16,
        phase: 0.8,
      });
    }

    // The long corridor needs more than one light to avoid a dark middle.
    if (d > 12 || w > 12) {
      const extra1 = light.clone();
      const extra2 = light.clone();
      if (d > w) {
        extra1.position.set(cx, light.position.y, room.minZ + d * 0.2);
        extra2.position.set(cx, light.position.y, room.maxZ - d * 0.2);
      } else {
        extra1.position.set(room.minX + w * 0.2, light.position.y, cz);
        extra2.position.set(room.maxX - w * 0.2, light.position.y, cz);
      }
      group.add(extra1, extra2);
    }
  }

  return {
    group,
    colliders,
    spawn: layout.spawn,
    update(elapsed: number) {
      for (const p of pulses) {
        p.material.emissiveIntensity =
          p.base + p.amplitude * Math.sin(2 * Math.PI * p.frequency * elapsed + p.phase);
      }
      for (const f of flickers) {
        // Two incommensurate sines read as organic waver, stay deterministic.
        f.light.intensity =
          f.base * (1 + 0.05 * Math.sin(elapsed * 9.7) + 0.04 * Math.sin(elapsed * 23.3 + 1.3));
      }
    },
    dispose() {
      disposeObject3D(group);
    },
  };
}
