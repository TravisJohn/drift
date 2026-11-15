import { describe, expect, it } from 'vitest';
import { TrackRotation } from '../../src/audio/trackRotation';

const fromFirst = (): TrackRotation => new TrackRotation(() => 0);

describe('TrackRotation', () => {
  it('has nothing to play while empty', () => {
    const r = fromFirst();
    expect(r.advance()).toBeNull();
    expect(r.current).toBeNull();
    expect(r.count).toBe(0);
  });

  it('plays tracks in order and wraps around', () => {
    const r = fromFirst();
    r.setTracks(['a', 'b', 'c']);
    expect([r.advance(), r.advance(), r.advance(), r.advance()]).toEqual(['a', 'b', 'c', 'a']);
  });

  it('a single track repeats', () => {
    const r = fromFirst();
    r.setTracks(['a']);
    expect([r.advance(), r.advance()]).toEqual(['a', 'a']);
  });

  it('a fresh list starts on a random track so sessions differ', () => {
    const r = new TrackRotation(() => 0.7);
    r.setTracks(['a', 'b', 'c']);
    expect(r.advance()).toBe('c');
    expect(r.advance()).toBe('a');
  });

  it('reports whether the list really changed', () => {
    const r = fromFirst();
    expect(r.setTracks(['a', 'b'])).toBe(true);
    expect(r.setTracks(['a', 'b'])).toBe(false);
    expect(r.setTracks(['a'])).toBe(true);
  });

  it('adding tracks keeps the current one and continues after it', () => {
    const r = fromFirst();
    r.setTracks(['b', 'd']);
    r.advance(); // b
    r.setTracks(['a', 'b', 'c', 'd']);
    expect(r.current).toBe('b');
    expect(r.advance()).toBe('c');
  });

  it('removing the current track continues with the one that followed it', () => {
    const r = fromFirst();
    r.setTracks(['a', 'b', 'c']);
    r.advance(); // a
    r.advance(); // b
    r.setTracks(['a', 'c']);
    expect(r.current).toBeNull();
    expect(r.advance()).toBe('c');
  });

  it('skips failed tracks, and says none when all failed', () => {
    const r = fromFirst();
    r.setTracks(['a', 'b']);
    expect(r.markFailed('a')).toBe(true);
    expect(r.markFailed('a')).toBe(false);
    expect([r.advance(), r.advance()]).toEqual(['b', 'b']);
    r.markFailed('b');
    expect(r.advance()).toBeNull();
  });

  it('forgets a failure once that track leaves the list', () => {
    const r = fromFirst();
    r.setTracks(['a', 'b']);
    r.markFailed('a');
    r.setTracks(['b']);
    r.setTracks(['a', 'b']);
    expect(r.advance()).toBe('a');
  });
});
