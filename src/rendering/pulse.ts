/**
 * Shared timing shapes for lights that blink: the drone's antenna beacon,
 * the ship's running lights. Pure functions of time, so they look the same
 * at any frame rate and can be tested without a renderer.
 */

/**
 * A short flash once per `period` seconds: rises and falls smoothly over
 * `flash` seconds, dark otherwise. `offset` shifts the flash later, so
 * several lights sharing a period can blink out of step. Returns 0..1.
 */
export function flashLevel(t: number, period: number, flash: number, offset = 0): number {
  const phase = (((t - offset) % period) + period) % period;
  return phase < flash ? Math.sin((Math.PI * phase) / flash) : 0;
}
