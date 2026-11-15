import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PuzzleOverlay, type PuzzleOverlayCallbacks } from '../../src/ui/puzzleOverlay';
import type { PuzzleHost, PuzzleModule } from '../../src/learning/puzzleModule';

/** A minimal module that exposes its host so tests can drive it. */
class ProbeModule implements PuzzleModule {
  readonly id = 'probe';
  readonly title = 'Probe console';
  host: PuzzleHost | null = null;
  mounted = 0;
  unmounted = 0;

  mount(body: HTMLElement, host: PuzzleHost): void {
    this.host = host;
    this.mounted++;
    body.appendChild(document.createElement('p'));
  }

  unmount(): void {
    this.unmounted++;
    this.host = null;
  }
}

describe('PuzzleOverlay', () => {
  let overlay: PuzzleOverlay;
  let module: ProbeModule;
  let callbacks: PuzzleOverlayCallbacks;
  let onCloseMock: ReturnType<typeof vi.fn>;
  let onCompleteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    overlay = new PuzzleOverlay();
    module = new ProbeModule();
    onCloseMock = vi.fn();
    onCompleteMock = vi.fn();
    callbacks = {
      onClose: onCloseMock as PuzzleOverlayCallbacks['onClose'],
      onComplete: onCompleteMock as PuzzleOverlayCallbacks['onComplete'],
    };
  });

  it('open mounts the module inside a titled panel', () => {
    overlay.open(module, callbacks);
    expect(overlay.isOpen).toBe(true);
    expect(document.querySelector('#puzzle h2')?.textContent).toBe('Probe console');
    expect(module.mounted).toBe(1);
    expect(document.querySelector('#puzzle .body p')).not.toBeNull();
  });

  it('Escape closes, unmounts and notifies onClose', () => {
    overlay.open(module, callbacks);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(overlay.isOpen).toBe(false);
    expect(document.querySelector('#puzzle')).toBeNull();
    expect(module.unmounted).toBe(1);
    expect(onCloseMock).toHaveBeenCalledOnce();
  });

  it('module completion fires onComplete then closes with onClose', () => {
    overlay.open(module, callbacks);
    module.host?.complete();
    expect(onCompleteMock).toHaveBeenCalledOnce();
    expect(onCloseMock).toHaveBeenCalledOnce();
    expect(overlay.isOpen).toBe(false);
  });

  it('module-requested close skips onComplete', () => {
    overlay.open(module, callbacks);
    module.host?.close();
    expect(onCompleteMock).not.toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalledOnce();
  });

  it('dispose-style close() does not notify and stops listening', () => {
    overlay.open(module, callbacks);
    overlay.close();
    expect(onCloseMock).not.toHaveBeenCalled();
    expect(module.unmounted).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('can be reopened after closing (fresh mount each time)', () => {
    overlay.open(module, callbacks);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    overlay.open(module, callbacks);
    expect(module.mounted).toBe(2);
    expect(overlay.isOpen).toBe(true);
  });
});
