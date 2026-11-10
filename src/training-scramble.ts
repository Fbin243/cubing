import { KPattern } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import type { TrainingCase } from './training';

function randomBelow(limit: number): number {
  const ceiling = Math.floor(256 / limit) * limit;
  const byte = new Uint8Array(1);
  do { crypto.getRandomValues(byte); } while (byte[0] >= ceiling);
  return byte[0] % limit;
}

function shuffled(values: number[]): number[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function parity(values: number[]): number {
  return values.reduce((sum, value, index) => sum + values.slice(index + 1).filter((other) => value > other).length, 0) % 2;
}

/** A legal cube state with the four D-layer cross edges solved, for F2L practice. */
export async function crossSolvedScramble(): Promise<string> {
  const puzzle = await puzzles['3x3x3'].kpuzzle();
  const solved = puzzle.defaultPattern();
  const data = structuredClone(solved.patternData);
  const edgePositions = [0, 1, 2, 3, 8, 9, 10, 11];
  const edges = shuffled(edgePositions);
  const corners = shuffled([0, 1, 2, 3, 4, 5, 6, 7]);
  edgePositions.forEach((position, i) => { data.EDGES.pieces[position] = edges[i]; });
  if (parity(data.EDGES.pieces) !== parity(corners)) [corners[0], corners[1]] = [corners[1], corners[0]];
  data.CORNERS.pieces = corners;
  let edgeSum = 0;
  for (const position of edgePositions.slice(0, -1)) { const orientation = randomBelow(2); data.EDGES.orientation[position] = orientation; edgeSum += orientation; }
  data.EDGES.orientation[edgePositions[edgePositions.length - 1]] = edgeSum % 2;
  let cornerSum = 0;
  for (let i = 0; i < 7; i++) { const orientation = randomBelow(3); data.CORNERS.orientation[i] = orientation; cornerSum += orientation; }
  data.CORNERS.orientation[7] = (3 - cornerSum % 3) % 3;
  const pattern = new KPattern(puzzle, data);
  const scramble = (await experimentalSolve3x3x3IgnoringCenters(pattern)).invert();
  if (JSON.stringify(solved.applyAlg(scramble).patternData) !== JSON.stringify(pattern.patternData)) throw new Error('Invalid cross-solved scramble');
  return scramble.toString();
}

/** D cross and three F2L slots solved; the R U R' slot remains unsolved. */
export async function singleSlotScramble(): Promise<string> {
  const puzzle = await puzzles['3x3x3'].kpuzzle();
  const solved = puzzle.defaultPattern();
  const cornerPositions = [0, 1, 2, 3, 4];
  const edgePositions = [0, 1, 2, 3, 8];
  let data: typeof solved.patternData;
  do {
    data = structuredClone(solved.patternData);
    const corners = shuffled(cornerPositions);
    const edges = shuffled(edgePositions);
    cornerPositions.forEach((position, i) => { data.CORNERS.pieces[position] = corners[i]; });
    edgePositions.forEach((position, i) => { data.EDGES.pieces[position] = edges[i]; });
    if (parity(data.CORNERS.pieces) !== parity(data.EDGES.pieces)) {
      [data.EDGES.pieces[0], data.EDGES.pieces[1]] = [data.EDGES.pieces[1], data.EDGES.pieces[0]];
    }
    let cornerSum = 0;
    let edgeSum = 0;
    for (let i = 0; i < 4; i++) {
      const corner = randomBelow(3);
      const edge = randomBelow(2);
      data.CORNERS.orientation[cornerPositions[i]] = corner;
      data.EDGES.orientation[edgePositions[i]] = edge;
      cornerSum += corner;
      edgeSum += edge;
    }
    data.CORNERS.orientation[4] = (3 - cornerSum % 3) % 3;
    data.EDGES.orientation[8] = edgeSum % 2;
  } while (data.CORNERS.pieces[4] === 4 && data.CORNERS.orientation[4] === 0 && data.EDGES.pieces[8] === 8 && data.EDGES.orientation[8] === 0);
  const pattern = new KPattern(puzzle, data);
  const scramble = (await experimentalSolve3x3x3IgnoringCenters(pattern)).invert();
  if (JSON.stringify(solved.applyAlg(scramble).patternData) !== JSON.stringify(pattern.patternData)) throw new Error('Invalid single-slot scramble');
  return scramble.toString();
}

/** A D cross solvable by reversing at most four face turns; distribution is not uniform. */
export async function easyCrossScramble(): Promise<string> {
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const turns = ['', '2', "'"];
  const suffix: string[] = [];
  let previousFace = '';
  for (let i = 0; i < 4; i++) {
    const choices = faces.filter((face) => face !== previousFace);
    const face = choices[randomBelow(choices.length)];
    suffix.push(face + turns[randomBelow(turns.length)]);
    previousFace = face;
  }
  return `${await crossSolvedScramble()} ${suffix.join(' ')}`;
}

/** Build a representative case and randomize its U adjustment; this is not a uniform case-state sampler. */
export async function trainingScramble(item: TrainingCase): Promise<string> {
  const puzzle = await puzzles['3x3x3'].kpuzzle();
  const solved = puzzle.defaultPattern();
  const data = structuredClone(solved.patternData);
  if (item.kind === 'OLL') {
    data.CORNERS.orientation.splice(0, 4, ...item.corners);
    data.EDGES.orientation.splice(0, 4, ...item.edges);
  } else {
    data.CORNERS.pieces.splice(0, 4, ...item.corners);
    data.EDGES.pieces.splice(0, 4, ...item.edges);
  }
  const auf = crypto.getRandomValues(new Uint8Array(1))[0] % 4;
  let pattern = new KPattern(puzzle, data);
  if (auf) pattern = pattern.applyAlg(auf === 1 ? 'U' : auf === 2 ? 'U2' : "U'");
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
  const scramble = solution.invert();
  if (JSON.stringify(solved.applyAlg(scramble).patternData) !== JSON.stringify(pattern.patternData)) throw new Error('Invalid training scramble');
  return scramble.toString();
}
