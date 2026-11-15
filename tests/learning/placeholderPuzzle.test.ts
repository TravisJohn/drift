import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceholderPuzzle } from '../../src/learning/placeholderPuzzle';
import type { PuzzleHost } from '../../src/learning/puzzleModule';

describe('PlaceholderPuzzle', () => {
  let body: HTMLElement;
  let host: PuzzleHost;
  let completeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    body = document.createElement('div');
    document.body.appendChild(body);
    completeMock = vi.fn();
    host = { close: vi.fn(), complete: completeMock as PuzzleHost['complete'] };
  });

  it('mounts the drill text and a completion button', () => {
    new PlaceholderPuzzle().mount(body, host);
    expect(body.querySelector('.puzzle-intro')?.textContent).toMatch(/AWS MACHINE LEARNING/);
    expect(body.querySelector('.puzzle-complete')).not.toBeNull();
  });

  it('the button reports completion to the host', () => {
    new PlaceholderPuzzle().mount(body, host);
    (body.querySelector('.puzzle-complete') as HTMLButtonElement).click();
    expect(completeMock).toHaveBeenCalledOnce();
  });

  it('unmount clears its DOM and allows a fresh mount', () => {
    const puzzle = new PlaceholderPuzzle();
    puzzle.mount(body, host);
    puzzle.unmount();
    expect(body.childElementCount).toBe(0);
    puzzle.mount(body, host); // reopening the terminal must work
    expect(body.querySelector('.puzzle-complete')).not.toBeNull();
  });

  it('double mount without unmount is a programming error', () => {
    const puzzle = new PlaceholderPuzzle();
    puzzle.mount(body, host);
    expect(() => puzzle.mount(body, host)).toThrow(/already mounted/);
  });
});
