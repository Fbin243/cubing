import { describe, expect, it } from 'vitest';
import { average, effectiveTime, formatTime, inspectionPenalty, mean, parseTime, type Solve } from './core';

function solve(timeMs: number, penalty: Solve['penalty'] = 'ok'): Solve {
  return { id: String(timeMs), sessionId: 's', timeMs, penalty, scramble: '', createdAt: '' };
}

describe('solve statistics', () => {
  it('applies inspection penalties at the 15 and 17 second boundaries', () => {
    expect(inspectionPenalty(15000)).toBe('ok');
    expect(inspectionPenalty(15000.01)).toBe('+2');
    expect(inspectionPenalty(17000)).toBe('+2');
    expect(inspectionPenalty(17000.01)).toBe('dnf');
  });
  it('applies penalties and handles DNF', () => {
    expect(effectiveTime(solve(1000, '+2'))).toBe(3000);
    expect(effectiveTime(solve(1000, 'dnf'))).toBe(Infinity);
  });

  it('trims fastest and slowest for ao5, including DNF', () => {
    expect(average([solve(1000), solve(2000), solve(3000), solve(4000), solve(5000, 'dnf')], 5)).toBe(3000);
    expect(average([solve(1000), solve(2000), solve(3000), solve(4000, 'dnf'), solve(5000, 'dnf')], 5)).toBe(Infinity);
  });

  it('calculates ao12 from the latest twelve solves and handles penalties', () => {
    const results = Array.from({ length: 12 }, (_, i) => solve((i + 1) * 1000));
    expect(average([solve(999000), ...results], 12)).toBe(6500);
    expect(average(results.map((result, i) => i === 5 ? { ...result, penalty: '+2' as const } : result), 12)).toBe(6700);
    expect(average(results.map((result, i) => i === 11 ? { ...result, penalty: 'dnf' as const } : result), 12)).toBe(6500);
    expect(average(results.map((result, i) => i >= 10 ? { ...result, penalty: 'dnf' as const } : result), 12)).toBe(Infinity);
    expect(average(results.slice(1), 12)).toBeNull();
  });

  it('uses the most recent 100 results and trims five at each end', () => {
    const results = Array.from({ length: 100 }, (_, i) => solve((i + 1) * 1000));
    expect(average(results, 100)).toBe(50500);
    expect(average([solve(999000), ...results], 100)).toBe(50500);
    const fiveDnfs = results.map((result, i) => i < 5 ? { ...result, penalty: 'dnf' as const } : result);
    expect(average(fiveDnfs, 100)).toBe(55500);
    expect(average(fiveDnfs.map((result, i) => i === 5 ? { ...result, penalty: 'dnf' as const } : result), 100)).toBe(Infinity);
    expect(average(results.slice(1), 100)).toBeNull();
  });

  it('formats long and missing times', () => {
    expect(formatTime(61329)).toBe('1:01.32');
    expect(formatTime(null)).toBe('—');
  });

  it('calculates a mean of three including penalties and DNFs', () => {
    expect(mean([solve(1000), solve(2000, '+2'), solve(4000)], 3)).toBe(3000);
    expect(mean([solve(1000), solve(2000), solve(3000, 'dnf')], 3)).toBe(Infinity);
    expect(mean([solve(1000)], 3)).toBeNull();
  });

  it('parses explicit times and rejects invalid values', () => {
    expect(parseTime('12.345')).toBe(12345);
    expect(parseTime('2:03.40')).toBe(123400);
    for (const value of ['', '0', '-1', '1:60', '1:2', '1.2345', 'NaN', '1e3']) expect(parseTime(value)).toBeNull();
  });
});
