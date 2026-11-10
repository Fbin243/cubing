export type Penalty = 'ok' | '+2' | 'dnf';

export type Solve = {
  id: string;
  sessionId: string;
  timeMs: number;
  penalty: Penalty;
  scramble: string;
  createdAt: string;
  trainingCase?: { kind: 'OLL' | 'PLL'; key: string };
};

export type Session = { id: string; name: string };

/** Inspection time is measured at the moment the timer starts. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  return elapsedMs > 17000 ? 'dnf' : elapsedMs > 15000 ? '+2' : 'ok';
}

export function effectiveTime(solve: Solve): number {
  if (solve.penalty === 'dnf') return Infinity;
  return solve.timeMs + (solve.penalty === '+2' ? 2000 : 0);
}

export function average(solves: Solve[], count: number): number | null {
  if (solves.length < count || count < 3) return null;
  const times = solves.slice(-count).map(effectiveTime).sort((a, b) => a - b);
  const trim = Math.ceil(count * 0.05);
  const kept = times.slice(trim, -trim);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

export function mean(solves: Solve[], count: number): number | null {
  if (count < 1 || solves.length < count) return null;
  return solves.slice(-count).reduce((sum, solve) => sum + effectiveTime(solve), 0) / count;
}

/** Parse seconds or minutes:seconds; reject ambiguous and out-of-range input. */
export function parseTime(input: string): number | null {
  const match = /^(?:(\d+):([0-5]\d(?:\.\d{1,3})?)|(\d+(?:\.\d{1,3})?))$/.exec(input.trim());
  if (!match) return null;
  const seconds = match[3] === undefined ? Number(match[1]) * 60 + Number(match[2]) : Number(match[3]);
  const ms = Math.round(seconds * 1000);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  if (!Number.isFinite(ms)) return 'DNF';
  const centiseconds = Math.floor(ms / 10);
  const seconds = Math.floor(centiseconds / 100);
  const fraction = String(centiseconds % 100).padStart(2, '0');
  if (seconds < 60) return `${seconds}.${fraction}`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${fraction}`;
}
