/**
 * PlaceholderPuzzle - the v0 stand-in for the AWS MLE training (PRD: the
 * side quest is placeholder-only until the vibe is proven).
 *
 * It renders one canned flash-card-style prompt so the plug-in seam is
 * demonstrably real, then logs the session. No scoring, no persistence.
 */
import type { PuzzleHost, PuzzleModule } from './puzzleModule';

export class PlaceholderPuzzle implements PuzzleModule {
  readonly id = 'placeholder';
  readonly title = 'Training console';

  private body: HTMLElement | null = null;

  mount(body: HTMLElement, host: PuzzleHost): void {
    if (this.body) {
      throw new Error('PlaceholderPuzzle: already mounted');
    }
    this.body = body;

    const intro = document.createElement('p');
    intro.className = 'puzzle-intro';
    intro.textContent =
      'CERTIFICATION DRILL — AWS MACHINE LEARNING ENGINEER. ' +
      'Module content pending upload from the company archive.';

    const card = document.createElement('p');
    card.className = 'puzzle-card';
    card.textContent =
      'Placeholder drill: a real question bank plugs in here later. ' +
      'For now, log the session and get back to your rounds.';

    const button = document.createElement('button');
    button.className = 'puzzle-complete';
    button.type = 'button';
    button.textContent = 'Log session';
    button.addEventListener('click', () => host.complete());

    body.append(intro, card, button);
  }

  unmount(): void {
    if (!this.body) return; // never mounted; nothing to tear down
    this.body.replaceChildren();
    this.body = null;
  }
}
