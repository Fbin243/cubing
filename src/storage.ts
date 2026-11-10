import type { Session, Solve } from './core';

export type Data = { version: 1; sessions: Session[]; solves: Solve[] };

const initialData = (): Data => ({ version: 1, sessions: [{ id: crypto.randomUUID(), name: 'Session 1' }], solves: [] });

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cubing', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadData(): Promise<Data> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('data').objectStore('data').get('current');
      request.onsuccess = () => {
        try { resolve(request.result === undefined ? initialData() : parseData(request.result)); }
        catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

let pendingWrite: Promise<void> = Promise.resolve();

export function saveData(data: Data): Promise<void> {
  const write = pendingWrite.catch(() => {}).then(() => writeData(data));
  pendingWrite = write;
  return write;
}

async function writeData(data: Data): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('data', 'readwrite');
      transaction.objectStore('data').put(data, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export function parseData(value: unknown): Data {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup');
  const d = value as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.sessions) || !Array.isArray(d.solves) || !d.sessions.length) throw new Error('Invalid backup');
  if (!d.sessions.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string')) throw new Error('Invalid sessions');
  const ids = new Set(d.sessions.map((s) => s.id));
  if (ids.size !== d.sessions.length || !d.solves.every((s) => s && typeof s.id === 'string' && ids.has(s.sessionId) && Number.isFinite(s.timeMs) && s.timeMs >= 0 && ['ok', '+2', 'dnf'].includes(s.penalty) && typeof s.scramble === 'string' && typeof s.createdAt === 'string' && (s.trainingCase === undefined || (s.trainingCase && ['OLL', 'PLL'].includes(s.trainingCase.kind) && typeof s.trainingCase.key === 'string' && /^[0-3]{8}$/.test(s.trainingCase.key)))) || new Set(d.solves.map((s) => s.id)).size !== d.solves.length) throw new Error('Invalid solves');
  return value as Data;
}
