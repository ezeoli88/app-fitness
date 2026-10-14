import { formatOptionalReps, formatOptionalWeight, parseRepsInput, parseWeightInput } from '@/domain/series';

describe('per-set values', () => {
  it('accepts blank values, explicit zero load and decimal comma or point', () => {
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('0')).toBe(0);
    expect(parseWeightInput('12,5')).toBe(12.5);
    expect(parseWeightInput('.5')).toBe(0.5);
    expect(parseWeightInput('12.5')).toBe(12.5);
    expect(parseRepsInput('')).toBeNull();
    expect(parseRepsInput('10')).toBe(10);
    expect(formatOptionalWeight(null)).toBe('');
    expect(formatOptionalWeight(0)).toBe('0');
    expect(formatOptionalReps(null)).toBe('');
  });

  it('rejects malformed weights and non-positive or fractional repetitions', () => {
    expect(() => parseWeightInput('-1')).toThrow();
    expect(() => parseWeightInput('2,3.4')).toThrow();
    expect(() => parseRepsInput('0')).toThrow();
    expect(() => parseRepsInput('1.5')).toThrow();
  });
});
