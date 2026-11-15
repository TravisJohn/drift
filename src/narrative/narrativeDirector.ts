/**
 * NarrativeDirector - decides when the ship AI speaks (M5).
 *
 * Pure TypeScript: game.ts forwards events as triggers; update(dt) answers
 * "what subtitle is on screen right now". Lines come from content
 * (content/aiLines.ts, D4) and rotate per trigger so repeats feel less
 * canned. A per-trigger cooldown keeps the AI from nagging when the player
 * hammers a locked helm.
 */
import { gameConfig } from '../config/gameConfig';
import { aiLines, validateAiLines, type AiLine, type NarrativeTrigger } from '../content/aiLines';

export interface TriggerContext {
  /** Fills `{destination}` in line templates. */
  readonly destination?: string;
}

interface QueuedLine {
  readonly text: string;
  /** Seconds left before the line appears. */
  delay: number;
  /** Seconds the line stays on screen once shown. */
  readonly duration: number;
}

export class NarrativeDirector {
  private readonly lines: Record<NarrativeTrigger, readonly AiLine[]>;
  private readonly cfg = gameConfig.narrative;

  private clock = 0;
  private readonly lastAccepted = new Map<NarrativeTrigger, number>();
  private readonly rotation = new Map<NarrativeTrigger, number>();
  private readonly queue: QueuedLine[] = [];
  private current: { text: string; remaining: number } | null = null;
  private gapRemaining = 0;

  constructor(lines: Record<NarrativeTrigger, readonly AiLine[]> = aiLines) {
    const problems = validateAiLines(lines);
    if (problems.length > 0) {
      throw new Error(`NarrativeDirector: invalid AI lines content:\n- ${problems.join('\n- ')}`);
    }
    this.lines = lines;
  }

  /**
   * Fire a trigger; returns false when the cooldown swallowed it.
   * Throws if a line template needs context the caller did not provide.
   */
  trigger(trigger: NarrativeTrigger, context: TriggerContext = {}): boolean {
    const last = this.lastAccepted.get(trigger);
    if (last !== undefined && this.clock - last < this.cfg.cooldownSeconds) {
      return false;
    }
    this.lastAccepted.set(trigger, this.clock);

    const list = this.lines[trigger];
    const index = this.rotation.get(trigger) ?? 0;
    this.rotation.set(trigger, (index + 1) % list.length);
    const line = list[index];
    if (!line) {
      throw new Error(`NarrativeDirector: no line at rotation ${index} for "${trigger}"`);
    }

    let text = line.text;
    if (text.includes('{destination}')) {
      if (!context.destination) {
        throw new Error(`NarrativeDirector: "${trigger}" line needs a destination`);
      }
      text = text.replaceAll('{destination}', context.destination);
    }

    this.queue.push({
      text,
      delay: line.delay ?? 0,
      duration: Math.max(this.cfg.minDuration, text.length * this.cfg.perCharSeconds),
    });
    return true;
  }

  /** The subtitle currently on screen (null = silence). Call per update. */
  update(dt: number): string | null {
    this.clock += dt;

    if (this.current) {
      this.current.remaining -= dt;
      if (this.current.remaining > 0) {
        return this.current.text;
      }
      this.current = null;
      this.gapRemaining = this.cfg.gapSeconds; // beat of silence between lines
    }

    if (this.gapRemaining > 0) {
      this.gapRemaining -= dt;
      return null;
    }

    const head = this.queue[0];
    if (head) {
      head.delay -= dt;
      if (head.delay <= 0) {
        this.queue.shift();
        this.current = { text: head.text, remaining: head.duration };
        return head.text;
      }
    }
    return null;
  }
}
