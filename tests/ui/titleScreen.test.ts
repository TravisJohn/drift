import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleScreen } from '../../src/ui/titleScreen';

describe('TitleScreen', () => {
  let screen: TitleScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new TitleScreen();
  });

  it('shows the name, the fiction line and a Begin button', () => {
    screen.show({ onBegin: () => undefined });
    expect(screen.isOpen).toBe(true);
    expect(document.querySelector('#title h1')?.textContent).toBe('DRIFT');
    expect(document.querySelector('#title .tagline')?.textContent).toMatch(/crew sleeps/i);
    expect(document.querySelector('#title .begin')).not.toBeNull();
  });

  it('Begin closes the screen first, then notifies (gesture-safe order)', () => {
    const order: string[] = [];
    screen.show({
      onBegin: () => {
        order.push('begin');
        expect(screen.isOpen).toBe(false); // already closed when told
      },
    });
    (document.querySelector('#title .begin') as HTMLButtonElement).click();
    expect(order).toEqual(['begin']);
    expect(document.querySelector('#title')).toBeNull();
  });

  it('close() without Begin never notifies (dispose path)', () => {
    const onBegin = vi.fn();
    screen.show({ onBegin: onBegin as () => void });
    screen.close();
    expect(onBegin).not.toHaveBeenCalled();
    expect(screen.isOpen).toBe(false);
  });
});
