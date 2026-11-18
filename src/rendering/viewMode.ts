/**
 * Which picture a frame draws. Pure, so the rules are testable apart from
 * the renderer.
 *
 * - 'cinematic': the exterior orbit shot during travel (V).
 * - 'dashboard': standing on the bridge, looking out of the viewport.
 * - 'interior': the follow camera inside the ship - the layered draw (D2),
 *   space seen only through the window openings.
 * - 'exterior': the follow camera has left the ship (the drone can fly out
 *   through a window). The ship is then drawn from outside, the same hull
 *   the cinematic shot shows, so inside and outside always agree.
 *
 * The test is the camera, not the drone: it is what the camera can see
 * that must be consistent. Between a room's wall and the hull skin the
 * camera still counts as inside, so the switch happens out in open space,
 * not in the thickness of the hull.
 */
export type ViewMode = 'cinematic' | 'dashboard' | 'interior' | 'exterior';

export interface ViewState {
  readonly cinematic: boolean;
  readonly dashboard: boolean;
  readonly cameraInsideHull: boolean;
}

export function chooseView(state: ViewState): ViewMode {
  if (state.cinematic) return 'cinematic';
  if (state.dashboard) return 'dashboard';
  return state.cameraInsideHull ? 'interior' : 'exterior';
}
