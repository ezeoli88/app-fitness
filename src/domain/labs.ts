/**
 * Análisis de sangre: Claude lee el PDF o la foto en el chat y guarda todos los valores por el conector MCP.
 * Cada valor lleva una clave estable (`key`) para seguirlo en el tiempo aunque cambie el laboratorio.
 */

export const LAB_CATEGORIES = [
  'metabolic',
  'lipids',
  'liver',
  'kidney',
  'blood_count',
  'iron',
  'thyroid',
  'vitamins',
  'hormones',
  'inflammation',
  'electrolytes',
  'urine',
  'other',
] as const;

export type LabCategory = (typeof LAB_CATEGORIES)[number];

export const LAB_CATEGORY_LABELS: Record<LabCategory, string> = {
  metabolic: 'Glucosa e insulina',
  lipids: 'Grasas en sangre',
  liver: 'Hígado',
  kidney: 'Riñón',
  blood_count: 'Hemograma',
  iron: 'Hierro',
  thyroid: 'Tiroides',
  vitamins: 'Vitaminas',
  hormones: 'Hormonas',
  inflammation: 'Inflamación',
  electrolytes: 'Electrolitos',
  urine: 'Orina',
  other: 'Otros',
};

/**
 * Claves sugeridas para que el mismo valor se llame igual en todos los estudios.
 * Para cualquier otro valor Claude inventa una clave en snake_case.
 */
export const COMMON_LAB_KEYS: Record<string, string> = {
  glucose: 'Glucosa en ayunas',
  hba1c: 'Hemoglobina glicosilada (HbA1c)',
  insulin: 'Insulina basal',
  homa_ir: 'HOMA-IR',
  triglycerides: 'Triglicéridos',
  hdl: 'Colesterol HDL',
  ldl: 'Colesterol LDL',
  total_cholesterol: 'Colesterol total',
  ast: 'TGO / AST',
  alt: 'TGP / ALT',
  ggt: 'GGT',
  alkaline_phosphatase: 'Fosfatasa alcalina',
  creatinine: 'Creatinina',
  urea: 'Urea',
  uric_acid: 'Ácido úrico',
  hemoglobin: 'Hemoglobina',
  hematocrit: 'Hematocrito',
  tsh: 'TSH',
  vitamin_d: 'Vitamina D',
  vitamin_b12: 'Vitamina B12',
  ferritin: 'Ferritina',
  crp: 'Proteína C reactiva',
};

/** Los valores que más dicen sobre grasa visceral y metabolismo: van primero en la pantalla. */
export const FOCUS_LAB_KEYS = ['glucose', 'hba1c', 'insulin', 'homa_ir', 'triglycerides', 'hdl', 'tg_hdl', 'alt', 'ggt'] as const;

export const LAB_FLAGS = ['low', 'normal', 'high', 'unknown'] as const;
export type LabFlag = (typeof LAB_FLAGS)[number];

export const LAB_FLAG_LABELS: Record<LabFlag, string> = {
  low: 'Bajo',
  normal: 'En rango',
  high: 'Alto',
  unknown: 'Sin rango',
};

export type LabResultInput = {
  key: string;
  name: string;
  category: LabCategory;
  value?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
};

export type LabReportInput = {
  day: string;
  lab?: string | null;
  note?: string | null;
  results: LabResultInput[];
};

export type LabResult = {
  id: number;
  key: string;
  name: string;
  category: LabCategory;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: LabFlag;
};

export type LabReport = {
  id: number;
  day: string;
  lab: string | null;
  note: string | null;
  results: LabResult[];
};

export const MAX_LAB_RESULTS = 200;
export const LAB_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Bajo, en rango o alto según el rango de referencia que trae el laboratorio. */
export function labFlag(value: number | null, refLow: number | null, refHigh: number | null): LabFlag {
  if (value === null || (refLow === null && refHigh === null)) return 'unknown';
  if (refLow !== null && value < refLow) return 'low';
  if (refHigh !== null && value > refHigh) return 'high';
  return 'normal';
}

/** Un punto de la evolución de un valor: un estudio, su fecha y lo que dio. */
export type LabPoint = { reportId: number; day: string; value: number | null; valueText: string | null; flag: LabFlag };

export type LabSeries = {
  key: string;
  name: string;
  category: LabCategory;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  /** Del estudio más viejo al más nuevo. */
  points: LabPoint[];
  latest: LabPoint;
};

/**
 * Agrupa los valores de todos los estudios por clave. El nombre, la unidad y el rango salen del estudio más nuevo.
 * Suma el cociente triglicéridos/HDL cuando un estudio trae los dos: es un buen indicador de resistencia a la insulina.
 */
export function labSeries(reports: LabReport[]): LabSeries[] {
  const ordered = [...reports].sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
  const byKey = new Map<string, LabSeries>();
  for (const report of ordered) {
    const results = [...report.results];
    const ratio = tgHdlRatio(report.results);
    if (ratio !== null && !results.some((result) => result.key === 'tg_hdl')) results.push(ratio);
    for (const result of results) {
      const point: LabPoint = { reportId: report.id, day: report.day, value: result.value, valueText: result.valueText, flag: result.flag };
      const current = byKey.get(result.key);
      const series: LabSeries = {
        key: result.key,
        name: result.name,
        category: result.category,
        unit: result.unit,
        refLow: result.refLow,
        refHigh: result.refHigh,
        refText: result.refText,
        points: current ? [...current.points, point] : [point],
        latest: point,
      };
      byKey.set(result.key, series);
    }
  }
  return [...byKey.values()];
}

/** Referencia usual del cociente triglicéridos/HDL en mg/dL: por debajo de 2 es bueno. */
export const TG_HDL_LIMIT = 2;

function tgHdlRatio(results: LabResult[]): LabResult | null {
  const tg = results.find((result) => result.key === 'triglycerides');
  const hdl = results.find((result) => result.key === 'hdl');
  if (!tg || !hdl || tg.value === null || hdl.value === null || hdl.value <= 0) return null;
  if (!isMgDl(tg.unit) || !isMgDl(hdl.unit)) return null;
  const value = Math.round((tg.value / hdl.value) * 100) / 100;
  return {
    id: -tg.id,
    key: 'tg_hdl',
    name: 'Triglicéridos / HDL',
    category: 'lipids',
    value,
    valueText: null,
    unit: null,
    refLow: null,
    refHigh: TG_HDL_LIMIT,
    refText: `< ${TG_HDL_LIMIT} (calculado)`,
    flag: labFlag(value, null, TG_HDL_LIMIT),
  };
}

function isMgDl(unit: string | null): boolean {
  return unit !== null && unit.replace(/\s/g, '').toLowerCase() === 'mg/dl';
}
