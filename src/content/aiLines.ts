/**
 * AI lines - what the ship's computer says, as data (D4).
 *
 * The NarrativeDirector picks a line when a trigger fires and shows it as a
 * HUD subtitle. Lines rotate in order per trigger, so writing more variety
 * is purely a content change. `{destination}` is replaced with the relevant
 * location's name. The tone is the game: calm, a little dry, never urgent.
 */

export type NarrativeTrigger =
  | 'started'
  | 'departed'
  | 'cruising'
  | 'arrived'
  | 'helmLocked'
  | 'terminalOpened'
  | 'dashboardOpened'
  | 'terminalComplete'
  | 'tetherWarning';

export interface AiLine {
  readonly text: string;
  /** Seconds to wait after the trigger before speaking. */
  readonly delay?: number;
}

export const aiLines: Record<NarrativeTrigger, readonly AiLine[]> = {
  started: [
    {
      text: 'Good cycle, little one. The crew is still asleep. It is just us again today.',
      delay: 2,
    },
  ],
  departed: [
    { text: 'Autopilot engaged. Making way for {destination}.' },
    { text: 'Course laid in for {destination}. You can wander — I have the helm.' },
  ],
  cruising: [
    { text: 'Course steady. Nothing out here but dust and the long dark.', delay: 7 },
    { text: 'All quiet. The pods are warm and the reactor hums along.', delay: 7 },
  ],
  arrived: [
    { text: 'We have arrived. {destination}, right where we left it.' },
    { text: 'Engines down. Hello again, {destination}.' },
  ],
  helmLocked: [
    { text: 'The course is already set. Enjoy the view — we will be there soon.' },
    { text: 'I have the helm, little one. Go look out a window.' },
  ],
  terminalOpened: [
    { text: 'Running your certification drills again? The crew would be proud.' },
    { text: 'The archive is slow tonight. Take your time.' },
  ],
  dashboardOpened: [
    { text: 'There she is. The whole ship, drawn in light.' },
    { text: 'Everything is where we left it. Look as long as you like.' },
  ],
  terminalComplete: [
    { text: 'Logged. One drill closer to that certification of yours.' },
    { text: 'Session saved. Back to your rounds, then.' },
  ],
  // The drone has drifted to the edge of its tether, out in space.
  tetherWarning: [
    { text: 'That is far enough, little one. Come back toward the hull.' },
    { text: 'Your signal is thinning. I would rather you stayed close.' },
    { text: 'Tether limit. The dark goes on forever; we do not.' },
  ],
};

/** Content validation (fail loud before the game starts). */
export function validateAiLines(lines: Record<NarrativeTrigger, readonly AiLine[]>): string[] {
  const problems: string[] = [];
  for (const [trigger, list] of Object.entries(lines)) {
    if (list.length === 0) problems.push(`trigger "${trigger}" has no lines`);
    for (const line of list) {
      if (!line.text.trim()) problems.push(`trigger "${trigger}" has an empty line`);
      if (line.delay !== undefined && line.delay < 0) {
        problems.push(`trigger "${trigger}" has a negative delay`);
      }
    }
  }
  return problems;
}
