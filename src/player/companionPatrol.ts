import { type Vec3, lerp, vec3 } from '../physics/vec3';

const COLORS = [0xb984ff, 0x50edff, 0x63f6a6, 0xffbb52, 0xff7298, 0x647cff];

export function companionColor(id: number): number {
  const preset = COLORS[id - 1];
  if (preset !== undefined) return preset;
  // Use a distinct set of lighter hull colours after the named palette.
  const band = 128;
  const color = ((id - COLORS.length - 1) * 48271) % band ** 3;
  const red = 96 + (color % band);
  const green = 96 + (Math.floor(color / band) % band);
  const blue = 96 + Math.floor(color / band ** 2);
  return red * 0x10000 + green * 0x100 + blue;
}

export function companionName(id: number): string {
  return `Vesper Scout ${String(id).padStart(2, '0')}`;
}

interface Stop {
  readonly position: Vec3;
  readonly scan?: Vec3;
}

const PORT_CONSOLE = vec3(-3.4, 0.55, -14.8);
const STARBOARD_CONSOLE = vec3(3.4, 0.55, -14.8);
const ROUTE: readonly Stop[] = [
  { position: vec3(-3.4, 1.45, -13.55), scan: PORT_CONSOLE },
  { position: vec3(-2.5, 1.45, -11.6) },
  { position: vec3(0, 1.45, -10.8) },
  { position: vec3(0, 1.45, -7.5) },
  { position: vec3(0, 1.45, -10.8) },
  { position: vec3(2.5, 1.45, -11.6) },
  { position: vec3(3.4, 1.45, -13.55), scan: STARBOARD_CONSOLE },
  { position: vec3(0, 1.45, -13.6) },
];
const SCAN_SECONDS = 2.4;
const SPEED = 1.55;
const legs = ROUTE.map((stop, index) => {
  const next = ROUTE[(index + 1) % ROUTE.length]!;
  return {
    stop,
    next,
    flight:
      Math.hypot(next.position.x - stop.position.x, next.position.z - stop.position.z) / SPEED,
    hold: stop.scan ? SCAN_SECONDS : 0,
  };
});
const period = legs.reduce((total, leg) => total + leg.hold + leg.flight, 0);

export function companionPose(
  id: number,
  time: number,
): {
  readonly position: Vec3;
  readonly yaw: number;
  readonly scan?: Vec3;
} {
  let elapsed = (time + (id - 1) * 4.7) % period;
  for (const { stop, next, flight, hold } of legs) {
    if (elapsed < hold) {
      const target = stop.scan!;
      return { position: stop.position, yaw: facing(stop.position, target), scan: target };
    }
    elapsed -= hold;
    if (elapsed < flight) {
      const fraction = elapsed / flight;
      const eased = fraction * fraction * (3 - 2 * fraction);
      return {
        position: lerp(stop.position, next.position, eased),
        yaw: facing(stop.position, next.position),
      };
    }
    elapsed -= flight;
  }
  // Exact end of the cycle after floating-point rounding.
  const first = ROUTE[0]!;
  return { ...first, yaw: 0 };
}

function facing(from: Vec3, toward: Vec3): number {
  return Math.atan2(from.x - toward.x, from.z - toward.z);
}
