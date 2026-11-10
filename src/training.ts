/** Last-layer cubie classes. Keys are internal pattern identifiers, not standard OLL/PLL names. */
export type TrainingCase = { kind: 'OLL' | 'PLL'; key: string; corners: number[]; edges: number[] };

const rotate = (a: number[], n: number) => a.slice(n).concat(a.slice(0, n));

export function ollKey(corners: number[], edges: number[]): string {
  return Array.from({ length: 4 }, (_, n) => rotate(corners, n).join('') + rotate(edges, n).join('')).sort()[0];
}

export function pllKey(corners: number[], edges: number[]): string {
  const forms: string[] = [];
  for (let before = 0; before < 4; before++) {
    for (let after = 0; after < 4; after++) {
      const shift = (pieces: number[]) => rotate(pieces, before).map((piece) => (piece + after) % 4).join('');
      forms.push(shift(corners) + shift(edges));
    }
  }
  return forms.sort()[0];
}

function permutations(values: number[]): number[][] {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map((tail) => [value, ...tail]));
}

function parity(values: number[]): number {
  return values.reduce((sum, value, index) => sum + values.slice(index + 1).filter((other) => value > other).length, 0) % 2;
}

export function ollCases(): TrainingCase[] {
  const cases = new Map<string, TrainingCase>();
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const corners = [a, b, c, (3 - (a + b + c) % 3) % 3];
      const edges = [x, y, z, (x + y + z) % 2];
      const key = ollKey(corners, edges);
      if (key !== '00000000' && !cases.has(key)) cases.set(key, { kind: 'OLL', key, corners, edges });
    }
  }
  return [...cases.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function pllCases(): TrainingCase[] {
  const cases = new Map<string, TrainingCase>();
  const all = permutations([0, 1, 2, 3]);
  const solvedKey = pllKey([0, 1, 2, 3], [0, 1, 2, 3]);
  for (const corners of all) for (const edges of all) {
    if (parity(corners) !== parity(edges)) continue;
    const key = pllKey(corners, edges);
    if (key !== solvedKey && !cases.has(key)) cases.set(key, { kind: 'PLL', key, corners, edges });
  }
  return [...cases.values()].sort((a, b) => a.key.localeCompare(b.key));
}
