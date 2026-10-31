import { describe, expect, it } from 'vitest';

import { labFlag, labSeries, type LabReport, type LabResult } from './labs';

function result(id: number, key: string, value: number, unit = 'mg/dL', refLow: number | null = null, refHigh: number | null = null): LabResult {
  return { id, key, name: key, category: 'lipids', value, valueText: null, unit, refLow, refHigh, refText: null, flag: labFlag(value, refLow, refHigh) };
}

describe('labFlag', () => {
  it('compara con el rango que trae el laboratorio', () => {
    expect(labFlag(108, 70, 100)).toBe('high');
    expect(labFlag(38, 40, null)).toBe('low');
    expect(labFlag(100, 70, 100)).toBe('normal');
    expect(labFlag(5, null, null)).toBe('unknown');
    expect(labFlag(null, 1, 2)).toBe('unknown');
  });
});

describe('labSeries', () => {
  it('ordena por fecha y suma triglicéridos/HDL solo en mg/dL', () => {
    const reports: LabReport[] = [
      { id: 2, day: '2026-09-01', lab: null, note: null, results: [result(3, 'triglycerides', 140), result(4, 'hdl', 50)] },
      { id: 1, day: '2026-03-01', lab: null, note: null, results: [result(1, 'triglycerides', 2.3, 'mmol/L'), result(2, 'hdl', 1, 'mmol/L')] },
    ];
    const series = labSeries(reports);
    const tg = series.find((item) => item.key === 'triglycerides');
    expect(tg?.points.map((point) => point.day)).toEqual(['2026-03-01', '2026-09-01']);
    expect(tg?.unit).toBe('mg/dL');
    const ratio = series.find((item) => item.key === 'tg_hdl');
    expect(ratio?.points.map((point) => [point.value, point.flag])).toEqual([[2.8, 'high']]);
  });
});
