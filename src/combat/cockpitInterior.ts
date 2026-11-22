/** Static foreground in pilot-seat coordinates. Painted once at each viewport size. */
export function paintCockpitInterior(
  width: number,
  height: number,
  pixelRatio: number,
  map: { cx: number; cy: number; radius: number },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const c = canvas.getContext('2d');
  if (!c) return canvas;

  // The frame and console share a 1200 × 720 drawing. Mirror the port geometry for starboard.
  c.scale(canvas.width / 1200, canvas.height / 720);
  const plate = (fill: string | CanvasGradient, points: readonly (readonly [number, number])[]) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  const finish = (y1: number, y2: number, ...colors: string[]) => {
    const g = c.createLinearGradient(0, y1, 0, y2);
    colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color));
    return g;
  };
  const fastener = (x: number, y: number) => {
    c.fillStyle = '#080e12';
    c.beginPath();
    c.arc(x, y, 3.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#627077';
    c.fillRect(x - 1.7, y - 0.8, 3.4, 1.1);
  };

  // Overhead lintel: rubber glazing seal below a folded metal edge.
  plate(finish(0, 32, '#141c21', '#38434a', '#111b22'), [
    [0, 0],
    [1200, 0],
    [1200, 33],
    [985, 16],
    [215, 16],
    [0, 33],
  ]);
  for (const port of [true, false]) {
    c.save();
    if (!port) {
      c.translate(1200, 0);
      c.scale(-1, 1);
    }

    // A side window shows through between the pillar and the sill.
    plate('#090e13', [
      [-8, 109],
      [19, 140],
      [198, 566],
      [159, 638],
      [-8, 162],
    ]);
    plate(finish(125, 585, port ? '#7e817a' : '#51626a', '#46525a', '#26333d'), [
      [-8, 121],
      [14, 146],
      [188, 559],
      [171, 583],
      [-8, 153],
    ]);
    plate('#1b262e', [
      [-8, 150],
      [171, 583],
      [165, 601],
      [-8, 165],
    ]);
    plate(port ? '#aaa696' : '#778c92', [
      [15, 149],
      [17, 150],
      [187, 555],
      [185, 552],
    ]);
    // Two steel collars bridge the faces of the spar.
    for (const [x, y] of [
      [57, 279],
      [129, 454],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(-0.395);
      c.fillStyle = '#151d23';
      c.fillRect(-9, 0, 19, 16);
      c.fillStyle = port ? '#797d77' : '#55656d';
      c.fillRect(-9, 1, 19, 3);
      fastener(0, 9);
      c.restore();
    }
    plate('#10181e', [
      [0, 460],
      [48, 485],
      [160, 587],
      [155, 720],
      [0, 720],
    ]);
    plate(finish(480, 645, '#60676a', '#34424c', '#151e27'), [
      [0, 474],
      [44, 493],
      [158, 591],
      [121, 619],
      [0, 552],
    ]);
    // Dashboard coaming: a top catching light, a deep fascia, and an inset service bay.
    plate(finish(556, 715, '#52606a', '#34424c', '#131e27'), [
      [-8, 641],
      [136, 552],
      [365, 577],
      [480, 603],
      [600, 601],
      [600, 725],
      [-8, 725],
    ]);
    plate(finish(550, 639, '#879095', '#465762', '#293a46'), [
      [-8, 634],
      [134, 549],
      [366, 574],
      [480, 597],
      [600, 595],
      [600, 608],
      [477, 610],
      [359, 591],
      [140, 565],
      [-8, 649],
    ]);
    plate('#131c21', [
      [142, 567],
      [359, 592],
      [476, 611],
      [600, 609],
      [600, 613],
      [476, 616],
      [357, 596],
      [143, 571],
    ]);
    c.save();
    c.transform(1, 0.115, -0.28, 1, 151, 579);
    plate('#71808a', [
      [0, 0],
      [207, 0],
      [216, 8],
      [216, 86],
      [6, 86],
      [0, 80],
    ]);
    plate('#111b22', [
      [1, 0],
      [207, 0],
      [214, 7],
      [214, 83],
      [6, 83],
      [1, 78],
    ]);
    plate(finish(3, 81, '#25333d', '#3c4850'), [
      [5, 4],
      [203, 4],
      [210, 10],
      [210, 78],
      [8, 78],
      [5, 74],
    ]);
    for (const x of [12, 198]) {
      fastener(x, 12);
      fastener(x, 70);
    }
    // Recessed louvres and a bank of guarded rocker switches.
    c.fillStyle = '#10191f';
    c.fillRect(26, 14, 73, 53);
    for (let y = 17; y < 65; y += 7) {
      c.fillStyle = '#414f57';
      c.fillRect(29, y, 67, 2.3);
    }
    for (let x = 116; x <= 172; x += 23) {
      c.fillStyle = '#11191d';
      c.fillRect(x - 3, 20, 18, 43);
      c.fillStyle = '#73818a';
      c.fillRect(x - 4, 18, 2, 42);
      c.fillStyle = finish(29, 54, '#818781', '#475156', '#29343d');
      c.fillRect(x, 30, 11, 24);
      c.fillStyle = x === 116 ? '#d9a36a' : '#7b9092';
      c.fillRect(x + 1, 24, 9, 2);
    }
    c.restore();
    c.restore();
  }

  // Anchor the emitter to the actual map foot in CSS pixels, including on tall viewports.
  c.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  c.translate(map.cx, map.cy + map.radius + 3);
  c.scale(map.radius / 100, map.radius / 100);
  const spill = c.createRadialGradient(0, 1, 1, 0, 1, 145);
  spill.addColorStop(0, 'rgba(89,211,237,.39)');
  spill.addColorStop(0.48, 'rgba(68,172,198,.18)');
  spill.addColorStop(1, 'rgba(55,157,188,0)');
  c.save();
  c.scale(1.8, 0.31);
  c.fillStyle = spill;
  c.beginPath();
  c.arc(0, 0, 145, 0, Math.PI * 2);
  c.fill();
  c.restore();
  plate(finish(-6, 18, '#83a7af', '#304956', '#16242d'), [
    [-78, 4],
    [-60, -8],
    [60, -8],
    [78, 4],
    [65, 17],
    [-65, 17],
  ]);
  plate('#111e26', [
    [-66, 4],
    [-55, -4],
    [55, -4],
    [66, 4],
    [54, 10],
    [-54, 10],
  ]);
  plate('#68c5d5', [
    [-43, 3],
    [-36, 0],
    [36, 0],
    [43, 3],
    [36, 5],
    [-36, 5],
  ]);
  return canvas;
}
