import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseMenu } from '../../src/ui/pauseMenu';

describe('PauseMenu', () => {
  let menu: PauseMenu;
  let onResume: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    menu = new PauseMenu();
    onResume = vi.fn();
  });

  const open = (): void => menu.open({ onResume: onResume as () => void });

  it('shows the panel with a controls reminder and a Resume button', () => {
    open();
    expect(menu.isOpen).toBe(true);
    expect(document.querySelector('#pause h2')?.textContent).toBe('Paused');
    expect(document.querySelectorAll('#pause .controls .row').length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector('#pause .resume')).not.toBeNull();
  });

  it('the Resume button closes and notifies once', () => {
    open();
    (document.querySelector('#pause .resume') as HTMLButtonElement).click();
    expect(onResume).toHaveBeenCalledOnce();
    expect(menu.isOpen).toBe(false);
    expect(document.querySelector('#pause')).toBeNull();
  });

  it('Escape resumes too', () => {
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(menu.isOpen).toBe(false);
  });

  it('close() without resuming never notifies and stops listening', () => {
    open();
    menu.close();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(onResume).not.toHaveBeenCalled();
  });

  it('can reopen after closing', () => {
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    open();
    expect(menu.isOpen).toBe(true);
  });
});
