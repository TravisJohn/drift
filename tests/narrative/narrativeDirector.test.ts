import { describe, expect, it } from 'vitest';
import { NarrativeDirector } from '../../src/narrative/narrativeDirector';
import {
  aiLines,
  validateAiLines,
  type AiLine,
  type NarrativeTrigger,
} from '../../src/content/aiLines';
import { gameConfig } from '../../src/config/gameConfig';

const DT = 0.1;

/** Advance until a subtitle appears (or the time budget runs out). */
function runUntilText(director: NarrativeDirector, maxSeconds: number): string | null {
  for (let t = 0; t < maxSeconds; t += DT) {
    const text = director.update(DT);
    if (text !== null) return text;
  }
  return null;
}

/** Advance until silence returns. */
function runUntilSilence(director: NarrativeDirector, maxSeconds: number): boolean {
  for (let t = 0; t < maxSeconds; t += DT) {
    if (director.update(DT) === null) return true;
  }
  return false;
}

const lines = (partial: Partial<Record<NarrativeTrigger, readonly AiLine[]>>) => ({
  ...aiLines,
  ...partial,
});

describe('aiLines content', () => {
  it('the shipped lines are valid', () => {
    expect(validateAiLines(aiLines)).toEqual([]);
  });

  it('validation catches empty triggers, empty text and negative delays', () => {
    const broken = lines({
      started: [],
      arrived: [{ text: '   ' }],
      cruising: [{ text: 'ok', delay: -1 }],
    });
    const problems = validateAiLines(broken);
    expect(problems.some((p) => p.includes('"started" has no lines'))).toBe(true);
    expect(problems.some((p) => p.includes('"arrived" has an empty line'))).toBe(true);
    expect(problems.some((p) => p.includes('"cruising" has a negative delay'))).toBe(true);
  });

  it('the director refuses invalid content at construction (fail loud)', () => {
    expect(() => new NarrativeDirector(lines({ started: [] }))).toThrow(/invalid AI lines/);
  });
});

describe('NarrativeDirector', () => {
  it('silence until a trigger fires, then the line appears', () => {
    const director = new NarrativeDirector();
    expect(director.update(DT)).toBeNull();
    director.trigger('helmLocked');
    expect(runUntilText(director, 2)).toMatch(/course is already set/i);
  });

  it('fills {destination} from context and throws without it', () => {
    const templates = lines({ departed: [{ text: 'Bound for {destination}.' }] });
    const director = new NarrativeDirector(templates);
    director.trigger('departed', { destination: 'Aurelia' });
    expect(runUntilText(director, 2)).toContain('Aurelia');
    expect(() => new NarrativeDirector(templates).trigger('departed')).toThrow(
      /needs a destination/,
    );
  });

  it('shows flight announcements as soon as the intercom plays them', () => {
    const director = new NarrativeDirector();
    director.trigger('dashboardOpened');
    director.update(DT);
    director.trigger('departed');
    expect(director.update(DT)).toBe('Preparing for warp drive.');
    director.trigger('cruising');
    director.trigger('arrived');
    expect(director.update(DT)).toBe('We have arrived.');
  });

  it('a delayed line waits its delay before speaking', () => {
    const director = new NarrativeDirector(
      lines({ cruising: [{ text: 'Quiet out here.', delay: 3 }] }),
    );
    director.trigger('cruising');
    let elapsed = 0;
    let text: string | null = null;
    while (text === null && elapsed < 10) {
      text = director.update(DT);
      elapsed += DT;
    }
    expect(text).toBe('Quiet out here.');
    expect(elapsed).toBeGreaterThanOrEqual(3);
  });

  it('lines last longer when they are longer, then fall silent', () => {
    const short = 'Hm.';
    const long = 'A'.repeat(200);
    const cfg = gameConfig.narrative;

    const a = new NarrativeDirector(lines({ helmLocked: [{ text: short }] }));
    a.trigger('helmLocked');
    expect(runUntilText(a, 1)).toBe(short);
    let shortTicks = 0;
    while (a.update(DT) !== null) shortTicks++;
    expect(shortTicks * DT).toBeGreaterThanOrEqual(cfg.minDuration - 2 * DT);

    const b = new NarrativeDirector(lines({ helmLocked: [{ text: long }] }));
    b.trigger('helmLocked');
    expect(runUntilText(b, 1)).toBe(long);
    let longTicks = 0;
    while (b.update(DT) !== null) longTicks++;
    expect(longTicks).toBeGreaterThan(shortTicks);
  });

  it('queued lines play in order with a beat of silence between', () => {
    const director = new NarrativeDirector(
      lines({
        departed: [{ text: 'First line.' }],
        cruising: [{ text: 'Second line.' }],
      }),
    );
    director.trigger('departed', { destination: 'x' });
    director.trigger('cruising');
    expect(runUntilText(director, 2)).toBe('First line.');
    expect(runUntilSilence(director, 60)).toBe(true);
    expect(runUntilText(director, 10)).toBe('Second line.');
  });

  it('rotates through a trigger lines on repeat fires', () => {
    const director = new NarrativeDirector(
      lines({ helmLocked: [{ text: 'Line A' }, { text: 'Line B' }] }),
    );
    director.trigger('helmLocked');
    expect(runUntilText(director, 2)).toBe('Line A');
    expect(runUntilSilence(director, 60)).toBe(true);
    // Wait out the cooldown before firing again.
    for (let t = 0; t < gameConfig.narrative.cooldownSeconds; t += DT) director.update(DT);
    expect(director.trigger('helmLocked')).toBe(true);
    expect(runUntilText(director, 2)).toBe('Line B');
  });

  it('the cooldown swallows rapid repeat triggers (anti-nag)', () => {
    const director = new NarrativeDirector();
    expect(director.trigger('helmLocked')).toBe(true);
    expect(director.trigger('helmLocked')).toBe(false); // hammering E
    director.update(DT);
    expect(director.trigger('helmLocked')).toBe(false);
  });

  it('cooldowns are per trigger, not global', () => {
    const director = new NarrativeDirector();
    expect(director.trigger('helmLocked')).toBe(true);
    expect(director.trigger('terminalOpened')).toBe(true);
  });
});
