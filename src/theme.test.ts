import { nextTheme, parseThemeName } from './theme';

test('parseThemeName accepts dark and light', () => {
  expect(parseThemeName('dark')).toBe('dark');
  expect(parseThemeName('light')).toBe('light');
});

test('parseThemeName falls back to dark', () => {
  expect(parseThemeName(null)).toBe('dark');
  expect(parseThemeName('')).toBe('dark');
  expect(parseThemeName('blue')).toBe('dark');
});

test('nextTheme flips between dark and light', () => {
  expect(nextTheme('dark')).toBe('light');
  expect(nextTheme('light')).toBe('dark');
});
