import { NEAR, clipToNear, project, type CameraPoint, type ScreenFrame } from './cockpitCamera';

type Point = readonly [number, number, number];
const paint = {
  alloy: [184, 192, 194],
  graphite: [75, 87, 98],
  belly: [91, 104, 112],
  canopy: [77, 163, 189],
  oxide: [218, 92, 61],
  gold: [247, 185, 77],
  intake: [26, 35, 44],
  lamp: [246, 124, 85],
  nozzle: [255, 163, 91],
  core: [255, 232, 179],
} satisfies Record<string, Point>;
type Paint = keyof typeof paint;
type Face = { ids: number[]; normal: Point; material: Paint };

/** Maximum wingtip distance from the centreline in model units. */
export const RAIDER_HALF_SPAN = 24;

// Fixed materials, with the sun above the port bow. Exhaust emits its own light.
const swatches = new Map<Paint, string[]>();
for (const key of Object.keys(paint) as Paint[]) {
  swatches.set(
    key,
    Array.from({ length: 32 }, (_, i) => {
      const light =
        key === 'nozzle' || key === 'core' || key === 'lamp' ? 1 : 0.44 + (0.64 * i) / 31;
      return (
        'rgb(' +
        paint[key].map((channel) => Math.min(255, Math.round(channel * light))).join(',') +
        ')'
      );
    }),
  );
}

/** Closed cross sections run nose-to-tail, wing-root-to-tip or fin-root-to-tip. */
function makeFighter(commander: boolean) {
  const vertices: Point[] = [];
  const faces: Face[] = [];
  const accent = commander ? 'gold' : 'oxide';

  function section(points: Point[]) {
    const ids = points.map((point) => vertices.push(point) - 1);
    const centre: [number, number, number] = [0, 0, 0];
    for (const [x, y, z] of points) {
      centre[0] += x / points.length;
      centre[1] += y / points.length;
      centre[2] += z / points.length;
    }
    return { ids, centre };
  }

  function face(ids: number[], material: Paint, inside: number[]) {
    const a = vertices[ids[0]!]!;
    const b = vertices[ids[1]!]!;
    const c = vertices[ids[2]!]!;
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const outward = nx * (a[0] - inside[0]!) + ny * (a[1] - inside[1]!) + nz * (a[2] - inside[2]!);
    const length = Math.hypot(nx, ny, nz) * (outward < 0 ? -1 : 1);
    if (length) faces.push({ ids, material, normal: [nx / length, ny / length, nz / length] });
  }

  function shell(rings: Point[][], coats: Paint[], front: Paint, back: Paint) {
    const sections = rings.map(section);
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1]!,
        b = sections[i]!;
      const inside = a.centre.map((v, j) => (v + b.centre[j]!) / 2);
      if (i === 1) face(a.ids, front, inside);
      for (let j = 0; j < a.ids.length; j++) {
        const next = (j + 1) % a.ids.length;
        face([a.ids[j]!, a.ids[next]!, b.ids[next]!, b.ids[j]!], coats[i - 1]!, inside);
      }
      if (i === sections.length - 1) face(b.ids, back, inside);
    }
  }

  // Hexagonal stations give each fuselage a keel, shoulder bevels and a flat dorsal spine.
  function hull(x: number, z: number, halfWidth: number, top: number, bottom: number): Point[] {
    const waist = (top + bottom) / 2;
    return [
      [x - halfWidth * 0.57, top, z],
      [x + halfWidth * 0.57, top, z],
      [x + halfWidth, waist, z],
      [x + halfWidth * 0.65, bottom, z],
      [x - halfWidth * 0.65, bottom, z],
      [x - halfWidth, waist, z],
    ];
  }
  shell(
    [
      hull(0, -24, 0.45, 0.4, -0.6),
      hull(0, -14, 2.6, 2.3, -1.7),
      hull(0, -6, 4.6, 3, -3.5),
      hull(0, 6, 5, 2.8, -3.9),
      hull(0, 14, 2.5, 1, -1.7),
    ],
    ['alloy', 'alloy', 'graphite', 'belly'],
    'alloy',
    'graphite',
  );
  shell(
    [
      hull(0, -15, 0.6, 2.1, 1.6),
      hull(0, -7, 2.9, 5.7, 2.1),
      hull(0, -2, 3.1, 6.2, 2.2),
      hull(0, -1.6, 3.1, 6.2, 2.2),
      hull(0, 4, 2.2, 3.5, 2.1),
    ],
    ['canopy', 'canopy', 'alloy', 'graphite'],
    'graphite',
    'graphite',
  );

  for (const side of [-1, 1]) {
    const wing = (
      x: number,
      y: number,
      lead: number,
      trail: number,
      thickness: number,
    ): Point[] => [
      [x * side, y, lead],
      [x * side, y + thickness, lead + (trail - lead) * 0.38],
      [x * side, y, trail],
      [x * side, y - thickness * 0.7, lead + (trail - lead) * 0.38],
    ];
    shell(
      [
        wing(3, 0, -10, 13, 2.1),
        wing(11, -0.8, -5, 12, 1.6),
        wing(17, -1.7, 1, 13, 1),
        wing(19, -1.7, 3, 13.5, 0.8),
        wing(RAIDER_HALF_SPAN, 0.5, 9, 12.5, 0.42),
      ],
      ['graphite', 'alloy', accent, 'graphite'],
      'graphite',
      accent,
    );

    const pod = (z: number, w: number, top: number, bottom: number) =>
      hull(side * 7, z, w, top, bottom);
    shell(
      [
        pod(-10, 2.1, 1.7, -2.3),
        pod(-9.4, 2.65, 2.4, -2.9),
        pod(-6, 3.2, 3, -3.5),
        pod(6, 3.25, 3.4, -3.5),
        pod(11, 3, 2.8, -3.1),
        pod(13, 2.7, 2.4, -2.8),
        pod(13.5, 2.25, 1.9, -2.3),
        pod(13.65, 1.25, 0.95, -1.35),
      ],
      ['alloy', accent, 'belly', 'graphite', 'alloy', 'graphite', 'nozzle'],
      'intake',
      'core',
    );

    // A narrow running light sits inside each recessed intake. Its face points forward.
    const x = side * 7;
    const light = section([
      [x - 1.45, 0.5, -10.1],
      [x + 1.45, 0.5, -10.1],
      [x + 1.18, -0.09, -10.1],
      [x - 1.18, -0.09, -10.1],
    ]);
    face(light.ids, commander ? 'core' : 'lamp', [x, 0, -9]);

    // Splayed fins rise above the canopy and catch the light even nose-on.
    const fin = (x: number, y: number, lead: number, trail: number, w: number): Point[] => [
      [side * (x - w), y, lead],
      [side * (x + w), y, lead + 0.5],
      [side * (x + w), y, trail],
      [side * (x - w), y, trail],
    ];
    const tip = commander ? 12 : 9.2;
    shell(
      [
        fin(7.2, 2.7, 0.3, 12.1, 0.65),
        fin(9.3, tip - 2.6, 6.5, 13.6, 0.43),
        fin(10.1, tip - 1.3, 7.9, 14, 0.34),
        fin(10.6, tip, 9.4, 14.2, 0.25),
      ],
      ['graphite', accent, commander ? 'gold' : 'alloy'],
      'graphite',
      accent,
    );
  }
  return { vertices, faces };
}

const fighter = makeFighter(false);
const commandFighter = makeFighter(true);

export function drawRaiderModel(
  ctx: CanvasRenderingContext2D,
  centre: CameraPoint,
  frame: ScreenFrame,
  scale: number,
  heading: number,
  bank: number,
  commander: boolean,
): void {
  const model = commander ? commandFighter : fighter;
  const ch = Math.cos(heading),
    sh = Math.sin(heading),
    cb = Math.cos(bank),
    sb = Math.sin(bank);
  function rotate([x, y, z]: Point): CameraPoint {
    const lateral = x * cb - y * sb;
    return { x: lateral * ch - z * sh, y: x * sb + y * cb, z: -lateral * sh - z * ch };
  }
  // Bloom sits behind the mesh and fades edge-on, so the nose never shows exhaust.
  const rear = rotate([0, 0, 1]);
  const facing =
    -(rear.x * centre.x + rear.y * centre.y + rear.z * centre.z) /
    Math.hypot(centre.x, centre.y, centre.z);
  if (facing > 0) {
    for (const x of [-7, 7]) {
      const v = rotate([x, -0.2, 13.7]);
      const at = project(
        { x: centre.x + v.x * scale, y: centre.y + v.y * scale, z: centre.z + v.z * scale },
        frame,
      );
      if (!at) continue;
      const radius = Math.max(1.6, 6.4 * scale * at.scale);
      const bloom = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
      bloom.addColorStop(0, `rgba(255,174,97,${0.64 * facing})`);
      bloom.addColorStop(1, 'rgba(244,102,47,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
    }
  }
  const points = model.vertices.map((vertex) => {
    const v = rotate(vertex);
    return { x: centre.x + scale * v.x, y: centre.y + scale * v.y, z: centre.z + scale * v.z };
  });
  const projected = points.map((v) => project(v, frame));
  const visible: { face: Face; depth: number; shade: number }[] = [];
  for (const face of model.faces) {
    const n = rotate(face.normal);
    const p = points[face.ids[0]!]!;
    if (n.x * p.x + n.y * p.y + n.z * p.z >= 0) continue;
    const depth = face.ids.reduce((sum, id) => sum + points[id]!.z, 0) / face.ids.length;
    const shade = Math.round(31 * Math.max(0, Math.min(1, -0.76 * n.x + 0.46 * n.y + 0.46 * n.z)));
    visible.push({ face, depth, shade });
  }
  visible.sort((a, b) => b.depth - a.depth);
  for (const { face, shade } of visible) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < face.ids.length; i++) {
      const id = face.ids[i]!,
        next = face.ids[(i + 1) % face.ids.length]!;
      const a = points[id]!,
        b = points[next]!;
      const at = projected[id];
      if (at) {
        if (started) ctx.lineTo(at.x, at.y);
        else ctx.moveTo(at.x, at.y);
        started = true;
      }
      const aIsNear = a.z < NEAR;
      const bIsNear = b.z < NEAR;
      if (aIsNear !== bIsNear) {
        const clipped = clipToNear(a, b)!;
        const edge = project(a.z < NEAR ? clipped[0] : clipped[1], frame, NEAR - 0.0001)!;
        if (started) ctx.lineTo(edge.x, edge.y);
        else ctx.moveTo(edge.x, edge.y);
        started = true;
      }
    }
    if (!started) continue;
    ctx.closePath();
    ctx.fillStyle = swatches.get(face.material)![shade]!;
    ctx.fill();
  }
}
