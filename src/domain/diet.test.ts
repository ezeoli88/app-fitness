import { addDays, countVerdicts, healthyWaistLimit, isLocalDay, localDay, waistToHeight } from '@/domain/diet';

describe('dieta', () => {
  it('cuenta el día en la hora de Buenos Aires', () => {
    expect(localDay(new Date('2026-10-31T02:30:00Z'))).toBe('2026-10-30');
    expect(localDay(new Date('2026-10-31T03:30:00Z'))).toBe('2026-10-31');
  });

  it('suma días cruzando meses y valida fechas', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(isLocalDay('2026-10-30')).toBe(true);
    expect(isLocalDay('2026-02-30')).toBe(false);
    expect(isLocalDay('30/10/2026')).toBe(false);
  });

  it('cuenta veredictos y calcula la cintura saludable', () => {
    expect(countVerdicts([{ verdict: 'ok' }, { verdict: 'too_much' }, { verdict: 'ok' }])).toEqual({ ok: 2, a_bit_much: 0, too_much: 1 });
    expect(waistToHeight(90, 178)).toBe(0.506);
    expect(waistToHeight(90, null)).toBeNull();
    expect(healthyWaistLimit(177)).toBe(88.5);
  });
});
