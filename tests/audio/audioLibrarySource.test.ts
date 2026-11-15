import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  AUDIO_LIBRARY_EVENT,
  AUDIO_LIBRARY_URL,
  type AudioLibrary,
} from '../../src/audio/audioLibrary';
import {
  connectAudioLibrary,
  fetchAudioLibrary,
  type LibraryFetch,
  type LibraryPushChannel,
} from '../../src/audio/audioLibrarySource';

const respond =
  (body: unknown, status = 200): LibraryFetch =>
  () =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

/** A fetch that resolves only when the test says so. */
function deferredFetch(body: unknown): { fetchFn: LibraryFetch; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    fetchFn: () => gate.then(() => ({ ok: true, status: 200, json: () => Promise.resolve(body) })),
    release,
  };
}

class FakePush implements LibraryPushChannel {
  private listeners = new Map<string, (data: unknown) => void>();
  on(event: string, listener: (data: unknown) => void): void {
    this.listeners.set(event, listener);
  }
  send(data: unknown): void {
    this.listeners.get(AUDIO_LIBRARY_EVENT)?.(data);
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('fetchAudioLibrary', () => {
  it('reads the listing from the agreed URL', async () => {
    const fetchFn = vi.fn(respond({ music: ['a'] }));
    await expect(fetchAudioLibrary(fetchFn)).resolves.toEqual({ music: ['a'] });
    expect(fetchFn).toHaveBeenCalledWith(AUDIO_LIBRARY_URL);
  });

  it('fails loudly on an HTTP error', async () => {
    await expect(fetchAudioLibrary(respond({}, 404))).rejects.toThrow(/HTTP 404/);
  });

  it('fails loudly on a malformed listing', async () => {
    await expect(fetchAudioLibrary(respond(['nope']))).rejects.toThrow(/Audio library/);
  });
});

describe('connectAudioLibrary', () => {
  let received: AudioLibrary[];
  let warn: MockInstance<(...args: unknown[]) => void>;
  let error: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    received = [];
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('delivers the startup listing', async () => {
    connectAudioLibrary((l) => received.push(l), respond({ music: ['a'] }), undefined);
    await settle();
    expect(received).toEqual([{ music: ['a'] }]);
  });

  it('delivers every pushed change after that (live add and delete)', async () => {
    const push = new FakePush();
    connectAudioLibrary((l) => received.push(l), respond({}), push);
    await settle();
    push.send({ music: ['a'] });
    push.send({});
    expect(received).toEqual([{}, { music: ['a'] }, {}]);
  });

  it('a slow startup fetch never overwrites a newer pushed listing', async () => {
    const push = new FakePush();
    const { fetchFn, release } = deferredFetch({ music: ['stale'] });
    connectAudioLibrary((l) => received.push(l), fetchFn, push);
    push.send({ music: ['fresh'] });
    release();
    await settle();
    expect(received).toEqual([{ music: ['fresh'] }]);
  });

  it('when the listing cannot be read the game gets an empty library and a warning', async () => {
    connectAudioLibrary((l) => received.push(l), respond({}, 500), undefined);
    await settle();
    expect(received).toEqual([{}]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a malformed pushed update is reported and ignored, keeping the last good one', async () => {
    const push = new FakePush();
    connectAudioLibrary((l) => received.push(l), respond({ music: ['a'] }), push);
    await settle();
    push.send('garbage');
    expect(received).toEqual([{ music: ['a'] }]);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
