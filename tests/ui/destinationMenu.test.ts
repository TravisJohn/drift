import { afterEach, describe, expect, it, vi } from 'vitest';
import { locations } from '../../src/content/destinations';
import { DestinationMenu } from '../../src/ui/destinationMenu';

const key = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));

describe('DestinationMenu', () => {
  let menu: DestinationMenu;

  afterEach(() => {
    menu?.close();
    document.body.innerHTML = '';
  });

  const openWith = (onSelect = vi.fn(), onCancel = vi.fn()) => {
    menu = new DestinationMenu();
    menu.open(locations.slice(1), { onSelect, onCancel });
    return { onSelect, onCancel };
  };

  it('renders one item per destination with name and ETA', () => {
    openWith();
    const items = document.querySelectorAll('#menu .item');
    expect(items).toHaveLength(3);
    expect(items[2]?.textContent).toContain('ETA 60s');
    expect(items[0]?.textContent).toContain('Aurelia');
    expect(items[0]?.textContent).toContain('ETA 100s');
  });

  it('the first item starts selected; arrows move the selection and wrap', () => {
    openWith();
    const selected = () => document.querySelector('#menu .item.selected')?.textContent ?? '';
    expect(selected()).toContain('Aurelia');
    key('ArrowDown');
    expect(selected()).toContain('Cinder');
    key('ArrowDown');
    expect(selected()).toContain('Vesper Station');
    key('ArrowDown'); // wraps
    expect(selected()).toContain('Aurelia');
    key('ArrowUp'); // wraps back
    expect(selected()).toContain('Vesper Station');
  });

  it('Enter engages the selected destination and closes the menu', () => {
    const { onSelect } = openWith();
    key('KeyS');
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith('cinder');
    expect(menu.isOpen).toBe(false);
    expect(document.querySelector('#menu')).toBeNull();
  });

  it('Escape cancels without selecting', () => {
    const { onSelect, onCancel } = openWith();
    key('Escape');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu.isOpen).toBe(false);
  });

  it('clicking an item engages it', () => {
    const { onSelect } = openWith();
    const second = document.querySelectorAll<HTMLElement>('#menu .item')[1];
    second?.dispatchEvent(new MouseEvent('mouseenter'));
    second?.dispatchEvent(new MouseEvent('click'));
    expect(onSelect).toHaveBeenCalledWith('cinder');
  });

  it('menu keys stop reaching the page while open (preventDefault)', () => {
    openWith();
    const event = new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('closing removes the key listener (no ghost selections)', () => {
    const { onSelect } = openWith();
    key('Escape');
    key('Enter');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('refuses to open with an empty destination list', () => {
    menu = new DestinationMenu();
    expect(() => menu.open([], { onSelect: vi.fn(), onCancel: vi.fn() })).toThrow(
      /no destinations/,
    );
  });
});
