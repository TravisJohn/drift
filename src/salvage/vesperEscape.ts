import { gameConfig } from '../config/gameConfig';
import type { Point, VesperDeck } from './vesperDeck';

interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Alien {
  x: number;
  y: number;
  angle: number;
  frozenUntil: number;
  waypoint: Position | null;
}

interface PortalAnchor extends Position {
  readonly room: string;
}

interface LaserFlash {
  readonly from: Point;
  readonly to: Point;
  readonly expires: number;
}

interface Waypoint extends Position {
  readonly links: Map<Waypoint, number>;
}

const cfg = gameConfig.salvage.escape;
const distance = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Chase and extraction rules for the third-cell breach. Distances follow the deck corridors. */
export class VesperEscape {
  readonly aliens: Alien[];
  readonly alienSpeed: number;
  readonly startedAt: number;
  portal: PortalAnchor;
  shiftAt: number;
  laser: LaserFlash | null = null;
  fireAt = 0;
  private readonly anchors: PortalAnchor[];
  private readonly waypoints = new Map<string, Waypoint>();
  private repathAt = 0;

  constructor(
    private readonly deck: VesperDeck,
    player: Position,
    time: number,
    private readonly random: () => number,
  ) {
    this.startedAt = time;
    this.alienSpeed =
      Math.max(
        ...deck.paths.filter((path) => path.kind === 'patroller').map((path) => path.speed),
      ) * cfg.alienSpeedMultiplier;
    this.anchors = Object.entries(deck.rooms).map(([room, { x, y }]) => ({ room, x, y }));
    this.portal = this.pickPortal(player);
    this.shiftAt = time + cfg.portalShiftSeconds;
    this.aliens = this.anchors
      .filter((anchor) => anchor !== this.portal && distance(anchor, player) >= cfg.spawnDistance)
      .sort((a, b) => distance(a, player) - distance(b, player))
      .slice(0, cfg.alienCount)
      .map(({ x, y }) => ({
        x,
        y,
        angle: Math.atan2(player.y - y, player.x - x),
        frozenUntil: 0,
        waypoint: null,
      }));

    for (const hall of deck.halls) {
      const route = hall.points.map(([x, y]) => {
        const key = `${x},${y}`;
        const node = this.waypoints.get(key) ?? { x, y, links: new Map<Waypoint, number>() };
        this.waypoints.set(key, node);
        return node;
      });
      for (let i = 1; i < route.length; i++) {
        const from = route[i - 1]!;
        const to = route[i]!;
        const length = distance(from, to);
        from.links.set(to, length);
        to.links.set(from, length);
      }
    }
  }

  /** Update pursuit first. A frozen alien is harmless until it thaws. */
  advance(player: Position, time: number, dt: number): 'caught' | 'escaped' | null {
    if (time >= this.repathAt) {
      this.repathAt = time + cfg.repathSeconds;
      const routes = this.distancesTo(player);
      for (const alien of this.aliens) alien.waypoint = this.nextWaypoint(alien, player, routes);
    }
    for (const alien of this.aliens) {
      if (time <= alien.frozenUntil) continue;
      this.moveAlien(alien, dt);
      if (
        distance(alien, player) <= cfg.contactRadius &&
        this.deck.clearPath(alien.x, alien.y, player.x, player.y)
      )
        return 'caught';
    }
    const portalDistance = distance(this.portal, player);
    if (portalDistance <= cfg.portalRadius) return 'escaped';
    // A portal locks when the drone is close enough to see it, so it can't jump at the last moment.
    if (time >= this.shiftAt) {
      const nearby =
        portalDistance <= cfg.portalHoldDistance &&
        this.deck.clearPath(player.x, player.y, this.portal.x, this.portal.y);
      if (!nearby) {
        this.portal = this.pickPortal(player, this.portal);
        this.shiftAt = time + cfg.portalShiftSeconds;
      }
    }
    return null;
  }

  fire(player: Position & { readonly angle: number }, time: number): boolean {
    if (time < this.fireAt) return false;
    this.fireAt = time + cfg.laserCooldown;
    const { x, y, angle } = player;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const wall = this.deck.ray(x, y, angle, cfg.laserRange);
    let reach = Math.hypot(wall[0] - x, wall[1] - y);
    let target: Alien | undefined;
    for (const alien of this.aliens) {
      const ax = alien.x - x;
      const ay = alien.y - y;
      const along = ax * dx + ay * dy;
      if (along < 0 || along > reach || Math.abs(ax * dy - ay * dx) > cfg.laserHitRadius) continue;
      const range = Math.hypot(ax, ay);
      const end = this.deck.ray(x, y, Math.atan2(ay, ax), range);
      if (Math.hypot(end[0] - x, end[1] - y) < range - 0.01) continue;
      target = alien;
      reach = along;
    }
    if (target) target.frozenUntil = time + cfg.freezeSeconds;
    this.laser = {
      from: [x, y],
      to: [x + dx * reach, y + dy * reach],
      expires: time + cfg.laserFlashSeconds,
    };
    return true;
  }

  private pickPortal(player: Position, previous?: PortalAnchor): PortalAnchor {
    const available = this.anchors.filter(
      (anchor) => anchor !== previous && anchor.room !== this.deck.airlockId,
    );
    const nearby = available.filter((anchor) => {
      const range = distance(anchor, player);
      return range >= 100 && range <= 375;
    });
    const pool = nearby.length ? nearby : available;
    return pool[Math.floor(this.random() * pool.length)]!;
  }

  /** Multi-source shortest paths, starting from the waypoints the drone can reach directly. */
  private distancesTo(player: Position): Map<Waypoint, number> {
    const remaining = new Set(this.waypoints.values());
    const distances = new Map<Waypoint, number>();
    for (const node of remaining) {
      if (
        distance(node, player) <= 200 &&
        this.deck.clearPath(node.x, node.y, player.x, player.y)
      ) {
        distances.set(node, distance(node, player));
      }
    }
    while (remaining.size) {
      let nearest: Waypoint | undefined;
      let best = Infinity;
      for (const node of remaining) {
        const score = distances.get(node) ?? Infinity;
        if (score >= best) continue;
        best = score;
        nearest = node;
      }
      if (!nearest) break;
      remaining.delete(nearest);
      for (const [node, length] of nearest.links) {
        if (best + length < (distances.get(node) ?? Infinity)) distances.set(node, best + length);
      }
    }
    return distances;
  }

  private nextWaypoint(
    alien: Alien,
    player: Position,
    routes: Map<Waypoint, number>,
  ): Position | null {
    if (this.deck.clearPath(alien.x, alien.y, player.x, player.y))
      return { x: player.x, y: player.y };
    let next: Waypoint | null = null;
    let best = Infinity;
    for (const [node, route] of routes) {
      const leg = distance(node, alien);
      if (
        leg <= 0.01 ||
        leg + route >= best ||
        !this.deck.clearPath(alien.x, alien.y, node.x, node.y)
      )
        continue;
      next = node;
      best = leg + route;
    }
    return next;
  }

  private moveAlien(alien: Alien, dt: number): void {
    const point = alien.waypoint;
    if (!point) return;
    const dx = point.x - alien.x;
    const dy = point.y - alien.y;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const fraction = Math.min(1, (this.alienSpeed * dt) / length);
    alien.x += dx * fraction;
    alien.y += dy * fraction;
    alien.angle = Math.atan2(dy, dx);
    if (fraction === 1) this.repathAt = 0;
  }
}
