import { describe, expect, it } from 'vitest';
import { KPattern } from 'cubing/kpuzzle';
import { Alg } from 'cubing/alg';
import { puzzles } from 'cubing/puzzles';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { ollCases, ollKey, pllCases, pllKey } from './training';
import { crossSolvedScramble, easyCrossScramble, singleSlotScramble, trainingScramble } from './training-scramble';

describe('independent last-layer case classes', () => {
  it('enumerates 57 distinct unsolved legal OLL orientation classes', () => {
    const cases = ollCases();
    expect(cases).toHaveLength(57);
    expect(new Set(cases.map((item) => item.key)).size).toBe(57);
    for (const item of cases) {
      expect(item.corners.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(item.edges.reduce((a, b) => a + b, 0) % 2).toBe(0);
      for (let n = 0; n < 4; n++) {
        const rotate = (a: number[]) => a.slice(n).concat(a.slice(0, n));
        expect(ollKey(rotate(item.corners), rotate(item.edges))).toBe(item.key);
      }
    }
  });

  it('enumerates 21 distinct unsolved PLL classes under pre/post U adjustment', () => {
    const cases = pllCases();
    expect(cases).toHaveLength(21);
    expect(new Set(cases.map((item) => item.key)).size).toBe(21);
    const parity = (p: number[]) => p.reduce((sum, x, i) => sum + p.slice(i + 1).filter((y) => x > y).length, 0) % 2;
    for (const item of cases) {
      expect(parity(item.corners)).toBe(parity(item.edges));
      for (let before = 0; before < 4; before++) for (let after = 0; after < 4; after++) {
        const adjust = (p: number[]) => p.slice(before).concat(p.slice(0, before)).map((x) => (x + after) % 4);
        expect(pllKey(adjust(item.corners), adjust(item.edges))).toBe(item.key);
      }
    }
  });

  it('solves and reconstructs every enumerated state using the cube engine', async () => {
    const puzzle = await puzzles['3x3x3'].kpuzzle();
    const solved = puzzle.defaultPattern();
    for (const item of [...ollCases(), ...pllCases()]) {
      const data = structuredClone(solved.patternData);
      if (item.kind === 'OLL') {
        data.CORNERS.orientation.splice(0, 4, ...item.corners);
        data.EDGES.orientation.splice(0, 4, ...item.edges);
      } else {
        data.CORNERS.pieces.splice(0, 4, ...item.corners);
        data.EDGES.pieces.splice(0, 4, ...item.edges);
      }
      const pattern = new KPattern(puzzle, data);
      const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
      expect(pattern.applyAlg(solution).patternData, item.key).toEqual(solved.patternData);
      expect(solved.applyAlg(solution.invert()).patternData, item.key).toEqual(pattern.patternData);
    }
  }, 120_000);

  it('generates scrambles whose rendered states match every selected case', async () => {
    const solved = (await puzzles['3x3x3'].kpuzzle()).defaultPattern();
    for (const item of [...ollCases(), ...pllCases()]) {
      const result = solved.applyAlg(await trainingScramble(item)).patternData;
      expect(result.CORNERS.pieces.slice(4), item.key).toEqual([4, 5, 6, 7]);
      expect(result.EDGES.pieces.slice(4), item.key).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
      const corners = item.kind === 'OLL' ? result.CORNERS.orientation : result.CORNERS.pieces;
      const edges = item.kind === 'OLL' ? result.EDGES.orientation : result.EDGES.pieces;
      expect((item.kind === 'OLL' ? ollKey : pllKey)(corners.slice(0, 4), edges.slice(0, 4)), item.key).toBe(item.key);
    }
  }, 120_000);
});

describe('cross-solved F2L practice', () => {
  it('produces reachable scrambled states with the D cross fixed', async () => {
    const solved = (await puzzles['3x3x3'].kpuzzle()).defaultPattern();
    const states = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pattern = solved.applyAlg(await crossSolvedScramble());
      expect(pattern.patternData.EDGES.pieces.slice(4, 8)).toEqual([4, 5, 6, 7]);
      expect(pattern.patternData.EDGES.orientation.slice(4, 8)).toEqual([0, 0, 0, 0]);
      expect(pattern.applyAlg(await experimentalSolve3x3x3IgnoringCenters(pattern)).patternData).toEqual(solved.patternData);
      states.add(JSON.stringify(pattern.patternData));
    }
    expect(states.size).toBe(20);
  }, 120_000);

  it('generates an easy D cross solvable by reversing the last four face turns', async () => {
    const solved = (await puzzles['3x3x3'].kpuzzle()).defaultPattern();
    for (let i = 0; i < 20; i++) {
      const scramble = await easyCrossScramble();
      const suffix = scramble.trim().split(/\s+/).slice(-4).join(' ');
      const recovered = solved.applyAlg(scramble).applyAlg(new Alg(suffix).invert());
      expect(recovered.patternData.EDGES.pieces.slice(4, 8)).toEqual([4, 5, 6, 7]);
      expect(recovered.patternData.EDGES.orientation.slice(4, 8)).toEqual([0, 0, 0, 0]);
    }
  }, 120_000);

  it('generates a legal unsolved single slot with the cross and other slots solved', async () => {
    const solved = (await puzzles['3x3x3'].kpuzzle()).defaultPattern();
    for (let i = 0; i < 20; i++) {
      const pattern = solved.applyAlg(await singleSlotScramble());
      const { CORNERS: corners, EDGES: edges } = pattern.patternData;
      expect(edges.pieces.slice(4, 8)).toEqual([4, 5, 6, 7]);
      expect(edges.orientation.slice(4, 8)).toEqual([0, 0, 0, 0]);
      expect(corners.pieces.slice(5)).toEqual([5, 6, 7]);
      expect(corners.orientation.slice(5)).toEqual([0, 0, 0]);
      expect(edges.pieces.slice(9)).toEqual([9, 10, 11]);
      expect(edges.orientation.slice(9)).toEqual([0, 0, 0]);
      expect(corners.pieces[4] === 4 && corners.orientation[4] === 0 && edges.pieces[8] === 8 && edges.orientation[8] === 0).toBe(false);
      expect(pattern.applyAlg(await experimentalSolve3x3x3IgnoringCenters(pattern)).patternData).toEqual(solved.patternData);
    }
  }, 120_000);
});
