/**
 * shipBuilder - turns the ship layout data into renderable meshes and
 * physics colliders (D4: content is data, not code).
 *
 * Meshes and colliders are generated from the same box list, so visuals and
 * collision cannot drift apart. Structure is merged into one panel-textured
 * mesh per surface kind, then dressed with trim (see trim.ts). Walls are built once per shared edge (with a
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
import { gameConfig } from '../../config/gameConfig';
import type { ArtSurface } from '../../content/artManifest';
import type { SurfaceArt } from '../../art/surfaceArt';
import {
  PANEL_FINISH,
  type PanelTextures,
  createPanelTextures,
} from '../../rendering/panelTextures';
import { buildBoxesGeometry } from './boxesGeometry';
import {
  type BakeLight,
  bakeVertexLight,
  setBakedLight,
  useBakedLight,
  worldVertices,
} from './bakedLighting';
import { type TrimBox, type TrimRole, buildTrimBoxes } from './trim';

/** One axis-aligned box with a material role. */
export interface ShipBox {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly role: 'floor' | 'ceiling' | 'wall' | PropKind;
}

type SurfaceKind = 'floor' | 'ceiling' | 'wall';

/**
 * How each structural surface is finished. `color` tints the panel texture
 * (which is grey); `tileSize` is the world metres one texture repeat spans.
 */
const SURFACES: Record<
  SurfaceKind,
  { readonly color: number; readonly tileSize: number; readonly faces: 'all' | 'top' | 'bottom' }
> = {
  floor: { color: 0x596372, tileSize: 2, faces: 'top' },
  ceiling: { color: 0x4a5462, tileSize: 2.4, faces: 'bottom' },
  // Wall tile = ceiling height: one belt seam at mid-height, none else.
  wall: { color: 0x6c7786, tileSize: 3.2, faces: 'all' },
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

const ROOM_LIGHT_INTENSITY = 11;
const AMBIENT_INTENSITY = 0.3;
/** Emissive level of the ceiling strips: above 1 so they bloom. */
const STRIP_GLOW = 1.8;

function createTrimMaterial(role: TrimRole): THREE.Material {
  switch (role) {
    case 'baseboard':
    case 'cove':
    case 'frame':
      return new THREE.MeshStandardMaterial({ color: 0x20252d, roughness: 0.45, metalness: 0.75 });
    case 'guideLight':
      // A faint line at ankle height: guides the eye down long rooms.
      return new THREE.MeshStandardMaterial({
        color: 0x0c1116,
        emissive: 0x5cc4dc,
        emissiveIntensity: 0.55,
      });
    case 'doorLight':
      return new THREE.MeshStandardMaterial({
        color: 0x0c1116,
        emissive: 0x8fe6ff,
        emissiveIntensity: 1.5,
      });
    case 'glass':
      // Barely there: a cool tint and a reflection, so a window reads as
      // glazed instead of as a hole in the wall.
      return new THREE.MeshPhysicalMaterial({
        color: 0xa8d4ee,
        transparent: true,
        opacity: 0.1,
        roughness: 0.04,
        metalness: 0,
        envMapIntensity: 2.5,
        depthWrite: false,
      });
  }
}

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
  /**
   * Brightness multiplier of the wavering lights (engineering's tired
   * fixture): 1 is nominal. Shared with every baked-light material.
   */
  readonly lightWaver: { readonly value: number };
  /**
   * Replace a surface's generated look with author-supplied art. The
   * baked lighting is untouched, so the art is lit exactly as the
   * generated panels were.
   */
  applySurfaceArt(surface: ArtSurface, art: SurfaceArt): void;
  /** Animate breathing glows and light flicker. `elapsed` is seconds. */
  update(elapsed: number): void;
  dispose(): void;
}

/** Linear RGB of a colour at a given intensity, as the bake wants it. */
function lightColor(hex: number, intensity: number): readonly [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r * intensity, c.g * intensity, c.b * intensity];
}

/** The room lights as data: one per room, three along a long corridor. */
export function buildRoomLights(layout: ShipLayout): BakeLight[] {
  const lights: BakeLight[] = [];
  const y = layout.ceilingHeight - 0.5;
  for (const room of layout.rooms) {
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const base = {
      color: lightColor(ROOM_LIGHT[room.id] ?? 0xcfd8e3, ROOM_LIGHT_INTENSITY),
      distance: Math.max(w, d) * 1.5,
      decay: 1.5,
      softRadius: 1.4,
      // Engineering's fixture is old and tired: it wavers, slightly (M6).
      wavers: room.id === 'engineering',
    };
    lights.push({ ...base, position: vec3(cx, y, cz) });
    // The long corridor needs more than one light to avoid a dark middle.
    if (d > 12) {
      lights.push({ ...base, position: vec3(cx, y, room.minZ + d * 0.2) });
      lights.push({ ...base, position: vec3(cx, y, room.maxZ - d * 0.2) });
    } else if (w > 12) {
      lights.push({ ...base, position: vec3(room.minX + w * 0.2, y, cz) });
      lights.push({ ...base, position: vec3(room.maxX - w * 0.2, y, cz) });
    }
  }
  return lights;
}

/** Build the renderable ship. Throws on invalid layout content (fail loud). */
export function buildShip(layout: ShipLayout): ShipWorld {
  const problems = validateLayout(layout);
  if (problems.length > 0) {
    throw new Error(`Ship layout is invalid:\n- ${problems.join('\n- ')}`);
  }

  const cfg = gameConfig.rendering;
  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const textures: PanelTextures[] = [];
  const pulses: GlowPulse[] = [];
  const lightWaver = { value: 1 };
  const roomLights = buildRoomLights(layout);

  /** Light a mesh from the room lights, shadowed by the ship's own boxes. */
  const patched = new Set<THREE.Material>();
  const bakedGeometries = new Set<THREE.BufferGeometry>();
  const bake = (mesh: THREE.Mesh, ownCollider = -1): void => {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material.isMeshStandardMaterial) return;
    // Each placement needs its own light values, so no shared geometry.
    if (bakedGeometries.has(mesh.geometry)) mesh.geometry = mesh.geometry.clone();
    bakedGeometries.add(mesh.geometry);
    const { positions, normals } = worldVertices(mesh);
    setBakedLight(
      mesh.geometry,
      bakeVertexLight(positions, normals, roomLights, colliders, ownCollider),
    );
    if (!patched.has(material)) {
      useBakedLight(material, lightWaver);
      patched.add(material);
    }
  };

  // Colliders come from the full box list (the source of truth). Structure
  // boxes are merged into one textured mesh per surface kind; props get
  // detailed visuals (M6) that stay inside the same collider footprint.
  const structure: Record<SurfaceKind, ShipBox[]> = { floor: [], ceiling: [], wall: [] };
  const propColliderIndex: number[] = [];
  for (const box of buildShipBoxes(layout)) {
    if (box.role === 'floor' || box.role === 'ceiling' || box.role === 'wall') {
      structure[box.role].push(box);
    } else {
      propColliderIndex.push(colliders.length); // props follow in layout order
    }
    colliders.push(boxFromCenterSize(box.center, box.size));
  }

  const lit: THREE.Mesh[] = [];
  const surfaceMaterials = new Map<ArtSurface, THREE.MeshStandardMaterial>();
  (Object.keys(structure) as SurfaceKind[]).forEach((kind, index) => {
    const surface = SURFACES[kind];
    const panels = createPanelTextures(kind, cfg.panelTextureSize, 101 + index);
    textures.push(panels);
    const mesh = new THREE.Mesh(
      buildBoxesGeometry(structure[kind], surface.tileSize, {
        maxCell: cfg.lightCellSize,
        faces: surface.faces,
      }),
      new THREE.MeshStandardMaterial({
        color: surface.color,
        map: panels.map,
        normalMap: panels.normalMap,
        roughness: PANEL_FINISH[kind].roughness,
        metalness: PANEL_FINISH[kind].metalness,
      }),
    );
    group.add(mesh);
    lit.push(mesh);
    surfaceMaterials.set(kind, mesh.material);
  });

  // --- Trim: baseboards, coves, frames, door lights, window glass ---
  const trimByRole = new Map<TrimRole, TrimBox[]>();
  for (const box of buildTrimBoxes(layout, structure.wall)) {
    const list = trimByRole.get(box.role) ?? [];
    list.push(box);
    trimByRole.set(box.role, list);
  }
  for (const [role, boxes] of trimByRole) {
    const mesh = new THREE.Mesh(
      buildBoxesGeometry(boxes, 1, { maxCell: cfg.lightCellSize * 2 }),
      createTrimMaterial(role),
    );
    group.add(mesh);
    if (role === 'baseboard' || role === 'cove' || role === 'frame') lit.push(mesh);
  }
  for (const mesh of lit) bake(mesh);

  layout.props.forEach((prop, index) => {
    const visual = buildPropVisual(prop.kind, prop.size, index * 1.7);
    visual.group.position.set(prop.center.x, prop.center.y, prop.center.z);
    group.add(visual.group);
    visual.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      // A prop sits inside its own collider; that box must not shadow it.
      if (mesh.isMesh) bake(mesh, propColliderIndex[index] ?? -1);
    });
    pulses.push(...visual.pulses);
  });

  // A dim base so nothing is ever pure black; all other room light is baked.
  group.add(new THREE.AmbientLight(0x1c2432, AMBIENT_INTENSITY));

  // --- Ceiling light strips: the visible source of each room's glow ---
  for (const room of layout.rooms) {
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const along = d >= w ? 'z' : 'x';
    const stripLength = (along === 'z' ? d : w) * 0.55;
    const stripMaterial = new THREE.MeshStandardMaterial({
      color: 0x10151c,
      emissive: ROOM_LIGHT[room.id] ?? 0xcfd8e3,
      emissiveIntensity: STRIP_GLOW,
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
        base: STRIP_GLOW,
        amplitude: 0.4,
        frequency: 0.16,
        phase: 0.8,
      });
    }
  }

  return {
    group,
    colliders,
    spawn: layout.spawn,
    lightWaver,
    applySurfaceArt(surface, art) {
      const material = surfaceMaterials.get(surface);
      if (!material) throw new Error(`Ship has no "${surface}" surface to dress`);
      // Geometry UVs are in units of the generated texture's tile; scale
      // the supplied picture to the tile size configured for art.
      const repeat = SURFACES[surface].tileSize / gameConfig.art.tileSize[surface];
      for (const texture of [art.map, art.normalMap, art.emissiveMap]) {
        texture?.repeat.set(repeat, repeat);
      }
      material.map = art.map;
      material.normalMap = art.normalMap;
      // The picture carries its own colours: stop tinting it.
      material.color.set(0xffffff);
      if (art.emissiveMap) {
        material.emissiveMap = art.emissiveMap;
        material.emissive.set(0xffffff);
        material.emissiveIntensity = gameConfig.art.emissiveLevel;
      }
      material.needsUpdate = true;
    },
    update(elapsed: number) {
      for (const p of pulses) {
        p.material.emissiveIntensity =
          p.base + p.amplitude * Math.sin(2 * Math.PI * p.frequency * elapsed + p.phase);
      }
      // Two incommensurate sines read as organic waver, stay deterministic.
      lightWaver.value = 1 + 0.05 * Math.sin(elapsed * 9.7) + 0.04 * Math.sin(elapsed * 23.3 + 1.3);
    },
    dispose() {
      disposeObject3D(group);
      for (const t of textures) t.dispose();
    },
  };
}
