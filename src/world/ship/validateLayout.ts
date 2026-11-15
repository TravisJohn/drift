/**
 * Layout validation - catches broken ship content before playtesting
 * (PRD success criterion: content validation tests).
 *
 * Returns human-readable problem strings; an empty array means the layout
 * is sound. game.ts refuses to start with an invalid layout (fail loud).
 */
import type { RoomSpec, ShipLayout } from '../../content/shipLayout';
import { exteriorSpans, sharedEdge } from './layoutGeometry';

export function validateLayout(layout: ShipLayout): string[] {
  const problems: string[] = [];
  const byId = new Map<string, RoomSpec>(layout.rooms.map((r) => [r.id, r]));

  // --- Rooms: well-formed, unique, non-overlapping ---
  const seen = new Set<string>();
  for (const room of layout.rooms) {
    if (seen.has(room.id)) problems.push(`duplicate room id "${room.id}"`);
    seen.add(room.id);
    if (room.maxX - room.minX <= 0 || room.maxZ - room.minZ <= 0) {
      problems.push(`room "${room.id}" has non-positive size`);
    }
  }
  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i] as RoomSpec;
      const b = layout.rooms[j] as RoomSpec;
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (overlapX > 1e-6 && overlapZ > 1e-6) {
        problems.push(`rooms "${a.id}" and "${b.id}" overlap`);
      }
    }
  }

  // --- Doors: valid rooms, shared edge wide enough, no duplicates ---
  const doorKeys = new Set<string>();
  for (const door of layout.doors) {
    const [aId, bId] = door.rooms;
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) {
      problems.push(`door references unknown room "${!a ? aId : bId}"`);
      continue;
    }
    const key = [aId, bId].sort().join('|');
    if (doorKeys.has(key)) problems.push(`duplicate door between "${aId}" and "${bId}"`);
    doorKeys.add(key);

    const edge = sharedEdge(a, b);
    if (!edge) {
      problems.push(`door between "${aId}" and "${bId}" but rooms share no edge`);
    } else if (edge.span.end - edge.span.start < layout.doorWidth + 0.4) {
      problems.push(
        `shared edge between "${aId}" and "${bId}" is too narrow for a ${layout.doorWidth}m door`,
      );
    }
  }

  // --- Connectivity: every room reachable through doors ---
  if (layout.rooms.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const door of layout.doors) {
      const [a, b] = door.rooms;
      if (!byId.has(a) || !byId.has(b)) continue;
      adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
      adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
    }
    const startRoom = layout.rooms[0] as RoomSpec;
    const reachable = new Set<string>([startRoom.id]);
    const queue: string[] = [startRoom.id];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const room of layout.rooms) {
      if (!reachable.has(room.id)) {
        problems.push(`room "${room.id}" is unreachable (no door path from "${startRoom.id}")`);
      }
    }
  }

  // --- Windows: on a real room, fully inside one exterior span ---
  for (const win of layout.windows) {
    const room = byId.get(win.roomId);
    if (!room) {
      problems.push(`window references unknown room "${win.roomId}"`);
      continue;
    }
    if (win.width <= 0)
      problems.push(`window on "${win.roomId}" ${win.side} has non-positive width`);
    const spans = exteriorSpans(room, win.side, layout.rooms);
    const lo = win.center - win.width / 2;
    const hi = win.center + win.width / 2;
    const margin = 0.2;
    const fits = spans.some((s) => lo >= s.start + margin && hi <= s.end - margin);
    if (!fits) {
      problems.push(
        `window on "${win.roomId}" ${win.side} (center ${win.center}, width ${win.width}) ` +
          `does not fit in an exterior wall span`,
      );
    }
    if (layout.windowBottom >= layout.windowTop || layout.windowTop > layout.ceilingHeight) {
      problems.push('window bottom/top heights are inconsistent with the ceiling');
    }
  }

  // --- Props: inside their room, above the floor, below the ceiling ---
  const propIds = new Set<string>();
  for (const prop of layout.props) {
    const room = byId.get(prop.roomId);
    const label = prop.id ?? `${prop.kind}@${prop.center.x},${prop.center.z}`;
    if (prop.id) {
      if (propIds.has(prop.id)) problems.push(`duplicate prop id "${prop.id}"`);
      propIds.add(prop.id);
    }
    if (!room) {
      problems.push(`prop "${label}" references unknown room "${prop.roomId}"`);
      continue;
    }
    const halfX = prop.size.x / 2;
    const halfZ = prop.size.z / 2;
    if (
      prop.center.x - halfX < room.minX - 1e-6 ||
      prop.center.x + halfX > room.maxX + 1e-6 ||
      prop.center.z - halfZ < room.minZ - 1e-6 ||
      prop.center.z + halfZ > room.maxZ + 1e-6
    ) {
      problems.push(`prop "${label}" sticks out of room "${room.id}"`);
    }
    if (prop.center.y - prop.size.y / 2 < -1e-6)
      problems.push(`prop "${label}" is below the floor`);
    if (prop.center.y + prop.size.y / 2 > layout.ceilingHeight + 1e-6) {
      problems.push(`prop "${label}" pokes through the ceiling`);
    }
  }

  // --- Spawn: inside a room ---
  const spawnRoom = layout.rooms.find(
    (r) =>
      layout.spawn.x > r.minX &&
      layout.spawn.x < r.maxX &&
      layout.spawn.z > r.minZ &&
      layout.spawn.z < r.maxZ,
  );
  if (!spawnRoom) problems.push('spawn point is not inside any room');
  if (layout.spawn.y < 0.4 || layout.spawn.y > layout.ceilingHeight - 0.4) {
    problems.push('spawn height is outside the safe hover range');
  }

  return problems;
}
