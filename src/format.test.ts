import { formatCompletedLong, formatHistoryDate } from './format';

test('formatHistoryDate uses short weekday and day number', () => {
  const iso = '2026-08-31T18:00:00.000-03:00';
  const text = formatHistoryDate(iso);
  expect(text).toMatch(/lun|mar|mié|mie|jue|vie|sáb|sab|dom/i);
  expect(text).toMatch(/\d/);
});

test('formatCompletedLong uses long weekday and day number', () => {
  const iso = '2026-08-31T18:00:00.000-03:00';
  const text = formatCompletedLong(iso);
  expect(text).toMatch(/lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo/i);
  expect(text).toMatch(/\d/);
});
