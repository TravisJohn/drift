import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

describe('EventBus', () => {
  it('delivers the payload to a subscribed handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('travel:requested', handler);
    bus.emit('travel:requested', { destinationId: 'kepler' });
    expect(handler).toHaveBeenCalledWith({ destinationId: 'kepler' });
  });

  it('supports payload-less events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('app:started', handler);
    bus.emit('app:started');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('delivers to every subscriber of the event, and only that event', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    bus.on('travel:departed', a);
    bus.on('travel:departed', b);
    bus.on('travel:arrived', other);
    bus.emit('travel:departed', { destinationId: 'kepler' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it('off() removes a handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('terminal:opened', handler);
    bus.off('terminal:opened', handler);
    bus.emit('terminal:opened', { terminalId: 't1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('the unsubscribe returned by on() removes exactly that handler', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.on('terminal:closed', a);
    bus.on('terminal:closed', b);
    unsubA();
    bus.emit('terminal:closed', { terminalId: 't1' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('once() fires exactly one time', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('travel:arrived', handler);
    bus.emit('travel:arrived', { destinationId: 'kepler' });
    bus.emit('travel:arrived', { destinationId: 'vega' });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ destinationId: 'kepler' });
  });

  it('a throwing handler is reported but does not stop later handlers', () => {
    const bus = new EventBus();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on('app:started', bad);
    bus.on('app:started', good);
    bus.emit('app:started');
    expect(good).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('a handler may unsubscribe itself during emit without breaking iteration', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const unsubSelf = bus.on('interact:focused', () => {
      calls.push('self');
      unsubSelf();
    });
    bus.on('interact:focused', () => calls.push('other'));
    bus.emit('interact:focused', { interactableId: 'helm' });
    bus.emit('interact:focused', { interactableId: 'helm' });
    expect(calls).toEqual(['self', 'other', 'other']);
  });

  it('tracks listener counts as subscriptions come and go', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('interact:blurred')).toBe(0);
    const unsub = bus.on('interact:blurred', () => {});
    expect(bus.listenerCount('interact:blurred')).toBe(1);
    unsub();
    expect(bus.listenerCount('interact:blurred')).toBe(0);
  });
});
