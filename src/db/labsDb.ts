import type { SqlDriver, Stmt } from '@/db/core/driver';
import { isLocalDay } from '@/domain/diet';
import { DomainError } from '@/domain/errors';
import {
  LAB_CATEGORIES,
  LAB_KEY_PATTERN,
  labFlag,
  MAX_LAB_RESULTS,
  type LabReport,
  type LabReportInput,
  type LabResult,
  type LabResultInput,
} from '@/domain/labs';

type ReportRow = { id: number; day: string; lab: string | null; note: string | null };

type ResultRow = {
  id: number;
  report_id: number;
  key: string;
  name: string;
  category: LabResult['category'];
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
};

const RESULT_COLUMNS = 'id, report_id, key, name, category, value, value_text, unit, ref_low, ref_high, ref_text';

function toResult(row: ResultRow): LabResult {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    value: row.value,
    valueText: row.value_text,
    unit: row.unit,
    refLow: row.ref_low,
    refHigh: row.ref_high,
    refText: row.ref_text,
    flag: labFlag(row.value, row.ref_low, row.ref_high),
  };
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function number(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) throw new DomainError('Hay un valor que no es un número válido.', 422);
  return value;
}

function cleanResult(input: LabResultInput): Omit<ResultRow, 'id' | 'report_id'> {
  const key = input.key.trim().toLowerCase();
  if (!LAB_KEY_PATTERN.test(key)) throw new DomainError(`La clave «${input.key}» tiene que estar en snake_case.`, 422);
  const name = text(input.name, 120);
  if (!name) throw new DomainError(`El valor «${key}» necesita un nombre.`, 422);
  if (!LAB_CATEGORIES.includes(input.category)) throw new DomainError(`La categoría de «${name}» no es válida.`, 422);
  const value = number(input.value);
  const valueText = text(input.valueText, 120);
  if (value === null && valueText === null) throw new DomainError(`«${name}» no tiene resultado.`, 422);
  return {
    key,
    name,
    category: input.category,
    value,
    value_text: valueText,
    unit: text(input.unit, 30),
    ref_low: number(input.refLow),
    ref_high: number(input.refHigh),
    ref_text: text(input.refText, 120),
  };
}

export type LabsDb = {
  saveReport(input: LabReportInput, now?: Date): Promise<LabReport>;
  deleteReport(id: number): Promise<boolean>;
  listReports(): Promise<LabReport[]>;
};

export function createLabsDb(driver: SqlDriver): LabsDb {
  async function listReports(): Promise<LabReport[]> {
    const [reports, results] = await Promise.all([
      driver.all<ReportRow>('SELECT id, day, lab, note FROM lab_reports ORDER BY day DESC, id DESC'),
      driver.all<ResultRow>(`SELECT ${RESULT_COLUMNS} FROM lab_results ORDER BY report_id, id`),
    ]);
    const byReport = new Map<number, LabResult[]>();
    for (const row of results) {
      const list = byReport.get(row.report_id) ?? [];
      list.push(toResult(row));
      byReport.set(row.report_id, list);
    }
    return reports.map((report) => ({ ...report, results: byReport.get(report.id) ?? [] }));
  }

  return {
    async saveReport(input, now = new Date()) {
      if (!isLocalDay(input.day)) throw new DomainError('La fecha del estudio no es válida.', 422);
      if (input.results.length === 0) throw new DomainError('El estudio no trae ningún valor.', 422);
      if (input.results.length > MAX_LAB_RESULTS) throw new DomainError(`Son demasiados valores (máximo ${MAX_LAB_RESULTS}).`, 422);
      const rows = input.results.map(cleanResult);
      const keys = new Set<string>();
      for (const row of rows) {
        if (keys.has(row.key)) throw new DomainError(`La clave «${row.key}» está repetida en el estudio.`, 422);
        keys.add(row.key);
      }
      // Un solo batch atómico: los valores apuntan al estudio recién creado, el de id más alto.
      const [created] = await driver.batch([
        {
          sql: 'INSERT INTO lab_reports (day, lab, note, created_at) VALUES (?, ?, ?, ?)',
          params: [input.day, text(input.lab, 120), text(input.note, 500), now.toISOString()],
        },
        ...rows.map((row): Stmt => ({
          sql: 'INSERT INTO lab_results (report_id, key, name, category, value, value_text, unit, ref_low, ref_high, ref_text) VALUES ((SELECT MAX(id) FROM lab_reports), ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [row.key, row.name, row.category, row.value, row.value_text, row.unit, row.ref_low, row.ref_high, row.ref_text],
        })),
      ]);
      const saved = (await listReports()).find((report) => report.id === created.lastInsertRowId);
      if (!saved) throw new Error('El estudio guardado no aparece.');
      return saved;
    },

    async deleteReport(id) {
      const [, report] = await driver.batch([
        { sql: 'DELETE FROM lab_results WHERE report_id = ?', params: [id] },
        { sql: 'DELETE FROM lab_reports WHERE id = ?', params: [id] },
      ]);
      return report.changes > 0;
    },

    listReports,
  };
}
