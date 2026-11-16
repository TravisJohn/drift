/**
 * renderScale - work out, from two timed frames, how many pixels this
 * machine can draw and still hold its frame rate.
 *
 * The game times a frame at the sharpest setting and one at the softest,
 * then solves for the sharpest setting that fits the time budget. That
 * puts a weak graphics chip on the right setting before play starts,
 * instead of running slow for many seconds while it creeps toward it.
 *
 * Also here: turning the browser's graphics-chip description into a name
 * a person can read. Both are pure.
 */

/** One timed frame: the pixel ratio it was drawn at, and how long it took. */
export interface ScaleSample {
  readonly scale: number;
  readonly frameMs: number;
}

/**
 * The sharpest pixel ratio whose frame fits `budgetMs`.
 *
 * Cost is modelled as a fixed part plus a part proportional to the number
 * of pixels (scale squared); two samples pin both down. A plain "cost is
 * proportional to pixels" guess would ignore the fixed part and choose a
 * setting that turns out too slow.
 */
export function fitRenderScale(
  low: ScaleSample,
  high: ScaleSample,
  budgetMs: number,
  minScale: number,
  maxScale: number,
): number {
  if (!(low.scale > 0) || !(high.scale > low.scale) || budgetMs <= 0 || maxScale < minScale) {
    throw new Error('fitRenderScale: need 0 < low.scale < high.scale, a budget and min <= max');
  }
  // Fast enough at full sharpness: nothing to trade away.
  if (high.frameMs <= budgetMs) return maxScale;

  const perPixel = (high.frameMs - low.frameMs) / (high.scale ** 2 - low.scale ** 2);
  const fixed = low.frameMs - perPixel * low.scale ** 2;
  // Timing noise can make the slope meaningless; with no usable model,
  // the softest setting is the safe answer for a machine that is slow.
  if (perPixel <= 0 || fixed >= budgetMs) return minScale;

  const fit = Math.sqrt((budgetMs - fixed) / perPixel);
  return Math.min(maxScale, Math.max(minScale, fit));
}

/**
 * A readable graphics-chip name from the browser's description, e.g.
 * "ANGLE (NVIDIA, NVIDIA Quadro P2000 (0x00001CBA) Direct3D11 vs_5_0
 * ps_5_0, D3D11)" becomes "NVIDIA Quadro P2000".
 */
export function shortGpuName(description: string): string {
  const trimmed = description.trim();
  if (trimmed === '') return 'Unknown graphics';
  const angle = /^ANGLE \([^,]+,\s*(.+)\)$/.exec(trimmed);
  const body = angle?.[1] ?? trimmed;
  return (
    body
      // Drop the device id, the driver/API details and anything after.
      .replace(/\s*\(0x[0-9a-fA-F]+\).*$/, '')
      .replace(/\s+Direct3D.*$/, '')
      .replace(/,.*$/, '')
      .replace(/\((R|TM)\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Unknown graphics'
  );
}

/**
 * True for the low-power graphics built into a processor - the kind a
 * laptop with two graphics chips gives a browser by default.
 */
export function isIntegratedGpu(name: string): boolean {
  return /\b(Intel|UHD|Iris|HD Graphics)\b/i.test(name) && !/\bArc\b/i.test(name);
}
