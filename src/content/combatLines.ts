/**
 * Combat lines - what the ship's AI says during a tactical fight, as data.
 *
 * Same voice as aiLines.ts: calm and a little dry, even under fire. Each
 * kind of moment has a few lines that rotate in order; a moment with no
 * entry stays silent. `{wave}` and `{score}` are filled in.
 */
import type { CombatEvent, Side } from '../combat/combatTypes';

export type CombatMoment =
  | 'engaged'
  | 'nextWave'
  | 'finalWave'
  | 'waveCleared'
  | 'firstKill'
  | 'kill'
  | 'commanderDown'
  | 'locked'
  | 'noLock'
  | 'missileAhead'
  | 'missileLeft'
  | 'missileRight'
  | 'missileBehind'
  | 'missileDown'
  | 'noMissiles'
  | 'overheated'
  | 'cooled'
  | 'shieldsDown'
  | 'hullCritical'
  | 'won'
  | 'lost';

export const combatLines: Record<CombatMoment, readonly string[]> = {
  engaged: [
    'Raiders on the scope. I have routed the defence grid to you, little one. Keep them off the hull.',
  ],
  nextWave: ['Wave {wave} inbound. Missiles reloaded.', 'More of them. Wave {wave}. Rearmed.'],
  finalWave: ['Last wave, and their commander with it. Take that one down and they will scatter.'],
  waveCleared: ['Wave clear. Shields restoring.', 'Scope is quiet. For now.'],
  firstKill: ['Good hit. Keep moving; they aim where you are going.'],
  kill: ['Raider down.', 'Another one gone.', 'Splash one. Find the next.'],
  commanderDown: ['Their commander is gone. The rest have lost their nerve.'],
  locked: ['Locked. Missile ready.'],
  noLock: ['Hold the aim on one until the ring closes, then fire.'],
  missileAhead: ['Missile, dead ahead. Drift off its line or shoot it down.', 'Missile ahead.'],
  missileLeft: ['Missile, port side. Drift right.', 'Missile from port.'],
  missileRight: ['Missile, starboard. Drift left.', 'Missile from starboard.'],
  missileBehind: ['Missile on our tail. Open the throttle, or turn the guns aft.', 'Missile, aft.'],
  missileDown: ['Missile down.', "Good shot. That one won't trouble us."],
  noMissiles: ['Missile racks are empty. The cannons still work.'],
  overheated: ['Cannons overheated. Give them a moment.'],
  cooled: ['Cannons cool. Weapons free.'],
  shieldsDown: ['Shields are down. Break away and let them recover.'],
  hullCritical: ['Hull is getting thin. Boost out of their fire.'],
  won: ['Sector clear. The crew slept through all of it. Score {score}.'],
  lost: ['Hull breach drill failed. The real ship is fine. Shall we go again?'],
};

/** The warning for a raider missile coming from each side. */
const MISSILE_FROM: Record<Side, CombatMoment> = {
  ahead: 'missileAhead',
  left: 'missileLeft',
  right: 'missileRight',
  behind: 'missileBehind',
};

/** Which moment an event is, if any. `firstKill` needs the running kill count. */
export function momentFor(event: CombatEvent, killsSoFar: number): CombatMoment | null {
  switch (event.type) {
    case 'waveStarted':
      if (event.wave === 1) return 'engaged';
      return event.wave >= 3 ? 'finalWave' : 'nextWave';
    case 'waveCleared':
      return event.last ? null : 'waveCleared';
    case 'raiderDestroyed':
      if (event.commander) return 'commanderDown';
      return killsSoFar <= 1 ? 'firstKill' : 'kill';
    case 'lockAcquired':
      return 'locked';
    case 'enemyMissileLaunched':
      return MISSILE_FROM[event.from];
    case 'enemyMissileDown':
      return 'missileDown';
    case 'missileDenied':
      return event.reason === 'empty' ? 'noMissiles' : 'noLock';
    case 'overheated':
      return 'overheated';
    case 'cooled':
      return 'cooled';
    case 'playerDamaged':
      if (event.shieldsDown) return 'shieldsDown';
      return event.hullCritical ? 'hullCritical' : null;
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    default:
      return null;
  }
}

/** Picks lines in rotation per moment and fills in their blanks. */
export class CombatVoice {
  private readonly next = new Map<CombatMoment, number>();

  say(moment: CombatMoment, fill: { wave?: number; score?: number } = {}): string {
    const lines = combatLines[moment];
    const index = this.next.get(moment) ?? 0;
    this.next.set(moment, index + 1);
    const line = lines[index % lines.length] ?? '';
    return line
      .replace('{wave}', String(fill.wave ?? ''))
      .replace('{score}', String(fill.score ?? ''));
  }
}
