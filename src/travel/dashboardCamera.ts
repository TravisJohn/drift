/**
 * dashboardCamera - the view while the ship dashboard is open: standing on
 * the bridge, looking ahead through the main viewport in the direction of
 * travel (north, -Z), so the stars come toward you during a journey.
 *
 * Pure: bridge room in, camera pose out. A slow, tiny sway keeps the shot
 * from feeling like a frozen picture.
 */
import { gameConfig } from '../config/gameConfig';
import type { RoomSpec } from '../content/shipLayout';
import { vec3 } from '../physics/vec3';
import type { CameraPose } from '../player/followCamera';

/** How far ahead of the camera the view is aimed, metres. */
const LOOK_AHEAD = 30;

export function dashboardPose(bridge: RoomSpec, elapsed: number): CameraPose {
  const cfg = gameConfig.dashboard;
  const depth = bridge.maxZ - bridge.minZ;
  if (depth <= 0) {
    throw new Error('dashboardPose: the bridge has no depth');
  }
  const centreX = (bridge.minX + bridge.maxX) / 2;
  return {
    position: vec3(
      centreX + Math.sin(elapsed * 0.21) * cfg.sway,
      cfg.eyeHeight + Math.sin(elapsed * 0.33) * cfg.sway * 0.5,
      // Measured back from the viewport (the bridge's north wall).
      bridge.minZ + depth * cfg.standBack,
    ),
    // Far ahead and a touch down, which centres the viewport in the frame.
    lookAt: vec3(
      centreX,
      cfg.eyeHeight - Math.tan(cfg.pitchDown) * LOOK_AHEAD,
      bridge.minZ + depth * cfg.standBack - LOOK_AHEAD,
    ),
  };
}
