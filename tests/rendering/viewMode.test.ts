import { describe, expect, it } from 'vitest';
import { chooseView } from '../../src/rendering/viewMode';

describe('chooseView (inside and outside always show the same ship)', () => {
  it('draws the interior while the camera is inside the hull', () => {
    expect(chooseView({ cinematic: false, dashboard: false, cameraInsideHull: true })).toBe(
      'interior',
    );
  });

  it('draws the ship from outside once the camera has left the hull', () => {
    expect(chooseView({ cinematic: false, dashboard: false, cameraInsideHull: false })).toBe(
      'exterior',
    );
  });

  it('lets the cinematic shot win over everything (V during travel)', () => {
    expect(chooseView({ cinematic: true, dashboard: true, cameraInsideHull: false })).toBe(
      'cinematic',
    );
  });

  it('keeps the dashboard view on the bridge whatever the follow camera did', () => {
    expect(chooseView({ cinematic: false, dashboard: true, cameraInsideHull: false })).toBe(
      'dashboard',
    );
  });
});
