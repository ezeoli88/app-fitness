import { parseSets, serializeSets } from './gymDb';

test('serializeSets roundtrips', () => {
  const sets = { 1: [true, false], 2: [true, true, true, true] };
  expect(parseSets(serializeSets(sets))).toEqual(sets);
});

test('parseSets empty object for blank', () => {
  expect(parseSets('')).toEqual({});
  expect(parseSets('{}')).toEqual({});
});
