import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadData, parseData, saveData, type Data } from './storage';

const backup = () => ({ version: 1, sessions: [{ id: 's', name: 'Practice' }], solves: [{ id: 'a', sessionId: 's', timeMs: 1234, penalty: 'ok', scramble: 'R U', createdAt: '2026-01-01' }] });

describe('backup validation', () => {
  it('accepts a valid backup', () => { expect(parseData(backup())).toEqual(backup()); });
  it('rejects duplicate solves and unknown sessions', () => {
    const duplicates = backup(); duplicates.solves.push({ ...duplicates.solves[0] });
    expect(() => parseData(duplicates)).toThrow();
    const orphan = backup(); orphan.solves[0].sessionId = 'missing';
    expect(() => parseData(orphan)).toThrow();
  });
  it('rejects unsupported versions and invalid times', () => {
    const future = backup(); future.version = 2;
    expect(() => parseData(future)).toThrow();
    const invalid = backup(); invalid.solves[0].timeMs = -1;
    expect(() => parseData(invalid)).toThrow();
  });
  it('accepts optional training metadata and rejects malformed case data', () => {
    const input = backup();
    const valid = { ...input, solves: [{ ...input.solves[0], trainingCase: { kind: 'PLL', key: '01230123' } }] };
    expect(parseData(valid)).toEqual(valid);
    expect(() => parseData({ ...valid, solves: [{ ...valid.solves[0], trainingCase: { kind: 'PLL', key: '<script>' } }] })).toThrow();
  });
});

describe('loading saved data', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns valid saved data and closes the database', async () => {
    const close = vi.fn();
    const stored = backup();
    vi.stubGlobal('indexedDB', {
      open: () => {
        const openRequest: { result?: unknown; onsuccess?: () => void } = {};
        openRequest.result = {
          close,
          transaction: () => ({ objectStore: () => ({ get: () => {
            const readRequest: { result: unknown; onsuccess?: () => void } = { result: stored };
            queueMicrotask(() => readRequest.onsuccess?.());
            return readRequest;
          } }) }),
        };
        queueMicrotask(() => openRequest.onsuccess?.());
        return openRequest;
      },
    });
    await expect(loadData()).resolves.toEqual(stored);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects corrupt stored data and closes the database', async () => {
    const close = vi.fn();
    vi.stubGlobal('indexedDB', {
      open: () => {
        const openRequest: { result?: unknown; onsuccess?: () => void } = {};
        openRequest.result = {
          close,
          transaction: () => ({ objectStore: () => ({ get: () => {
            const readRequest: { result: unknown; onsuccess?: () => void } = { result: { version: 2 } };
            queueMicrotask(() => readRequest.onsuccess?.());
            return readRequest;
          } }) }),
        };
        queueMicrotask(() => openRequest.onsuccess?.());
        return openRequest;
      },
    });
    await expect(loadData()).rejects.toThrow('Invalid backup');
    expect(close).toHaveBeenCalledOnce();
  });

  it('propagates an IndexedDB read error and closes the database', async () => {
    const close = vi.fn();
    const failure = new Error('read failed');
    vi.stubGlobal('indexedDB', {
      open: () => {
        const openRequest: { result?: unknown; onsuccess?: () => void } = {};
        openRequest.result = {
          close,
          transaction: () => ({ objectStore: () => ({ get: () => {
            const readRequest: { error: Error; onerror?: () => void } = { error: failure };
            queueMicrotask(() => readRequest.onerror?.());
            return readRequest;
          } }) }),
        };
        queueMicrotask(() => openRequest.onsuccess?.());
        return openRequest;
      },
    });
    await expect(loadData()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('serialized saves', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects an aborted transaction and closes the database', async () => {
    const close = vi.fn();
    const failure = new Error('transaction aborted');
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        request.result = {
          close,
          transaction: () => {
            const tx: { error: Error; onabort?: () => void; objectStore: () => { put: () => void } } = {
              error: failure,
              objectStore: () => ({ put: () => { queueMicrotask(() => tx.onabort?.()); } }),
            };
            return tx;
          },
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    await expect(saveData(backup() as Data)).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it('continues in order after a failed transaction', async () => {
    const writes: string[] = [];
    let transactions = 0;
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { result?: unknown; onsuccess?: () => void } = {};
        request.result = {
          close: () => {},
          transaction: () => {
            const attempt = ++transactions;
            const tx: { oncomplete?: () => void; onerror?: () => void; error: Error | null; objectStore: () => { put: (data: Data) => void } } = {
              error: attempt === 1 ? new Error('write failed') : null,
              objectStore: () => ({ put: (data) => {
                writes.push(data.sessions[0].name);
                queueMicrotask(() => attempt === 1 ? tx.onerror?.() : tx.oncomplete?.());
              } }),
            };
            return tx;
          },
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    const first = { ...backup(), sessions: [{ id: 's', name: 'First' }] } as Data;
    const second = { ...backup(), sessions: [{ id: 's', name: 'Second' }] } as Data;
    const third = { ...backup(), sessions: [{ id: 's', name: 'Third' }] } as Data;
    const results = await Promise.allSettled([saveData(first), saveData(second), saveData(third)]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(writes).toEqual(['First', 'Second', 'Third']);
  });
});
