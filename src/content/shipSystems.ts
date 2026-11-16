/**
 * Ship systems - what the dashboard says about the vessel, as data (D4).
 *
 * Pure content: the name on the dashboard and one line of status per
 * compartment. Live values (journey, autopilot, reactor state) are worked
 * out in ui/dashboardModel.ts from the game's state; the words are here.
 */
import type { RoomId } from './shipLayout';

/** Shown as the dashboard's heading. */
export const VESSEL_NAME = 'RV Drift';

/** One calm line per compartment, shown when it is selected. */
export const roomReadouts: Record<RoomId, string> = {
  bridge: 'Helm and navigation. Autopilot holds the conn.',
  corridor: 'Spine of the ship. Pressure and gravity nominal.',
  lab: 'Survey instruments idle. Training terminal online.',
  cargo: 'Six containers secured. Nothing has shifted.',
  cryo: 'All pods occupied. Sleepers stable and warm.',
  engineering: 'Reactor steady. One light fixture is due for replacement.',
};
