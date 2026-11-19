import { MathUtils } from 'three';
import { gameConfig } from '../../config/gameConfig';

/** Common dimmer for room lighting. The first cycle begins two minutes into play. */
export function cabinLightLevel(playingSeconds: number): number {
  const { intervalSeconds, fadeDownSeconds, dimSeconds, fadeUpSeconds, minimumLight } =
    gameConfig.interior.powerSave;
  if (playingSeconds < intervalSeconds) return 1;

  const phase = playingSeconds % intervalSeconds;
  const riseStart = fadeDownSeconds + dimSeconds;
  const dim =
    MathUtils.smoothstep(phase, 0, fadeDownSeconds) *
    (1 - MathUtils.smoothstep(phase, riseStart, riseStart + fadeUpSeconds));
  return MathUtils.lerp(1, minimumLight, dim);
}
