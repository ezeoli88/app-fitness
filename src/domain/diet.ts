/** La app es de una sola persona en Argentina: los días de la dieta se cuentan en esta zona. */
export const DIET_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export const MEAL_VERDICTS = ['ok', 'a_bit_much', 'too_much'] as const;
export const PROTEIN_LEVELS = ['enough', 'low'] as const;
export const CARB_LEVELS = ['ok', 'high'] as const;

export type MealVerdict = (typeof MEAL_VERDICTS)[number];
export type ProteinLevel = (typeof PROTEIN_LEVELS)[number];
export type CarbLevel = (typeof CARB_LEVELS)[number];

export const VERDICT_LABELS: Record<MealVerdict, string> = {
  ok: 'Porción bien',
  a_bit_much: 'Un poco mucho',
  too_much: 'Mucho',
};
export const PROTEIN_LABELS: Record<ProteinLevel, string> = { enough: 'bien', low: 'poca' };
export const CARB_LABELS: Record<CarbLevel, string> = { ok: 'bien', high: 'muchos' };

/** Objetivo con el que Claude juzga cada plato. Lo lee el conector MCP como instrucciones. */
export const DIET_GOAL = [
  'Bajar grasa, sobre todo la visceral, y ganar músculo.',
  'Dieta alta en proteína y baja en carbohidratos.',
  'Llegar a una cintura saludable: menos de la mitad de la altura.',
].join(' ');

export type Meal = {
  id: number;
  eatenAt: string;
  day: string;
  title: string;
  verdict: MealVerdict;
  protein: ProteinLevel;
  carbs: CarbLevel;
  note: string | null;
};

export type MealInput = {
  title: string;
  verdict: MealVerdict;
  protein: ProteinLevel;
  carbs: CarbLevel;
  note?: string | null;
  eatenAt?: string;
};

export type WaistMeasurement = { id: number; day: string; cm: number };

export type VerdictCounts = Record<MealVerdict, number>;

export type DietSummary = {
  today: string;
  from: string;
  meals: Meal[];
  counts: VerdictCounts;
  waist: WaistMeasurement[];
  heightCm: number | null;
  /** Cintura / altura de la última medida; null sin medida o sin altura. */
  waistToHeight: number | null;
};

export const MIN_WAIST_CM = 40;
export const MAX_WAIST_CM = 200;
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 230;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DIET_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha local `YYYY-MM-DD` de un instante. */
export function localDay(date: Date): string {
  return dayFormat.format(date);
}

/** Suma días a una fecha `YYYY-MM-DD` sin pasar por la zona horaria. */
export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  return shifted.toISOString().slice(0, 10);
}

export function isLocalDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

export function countVerdicts(meals: Pick<Meal, 'verdict'>[]): VerdictCounts {
  const counts: VerdictCounts = { ok: 0, a_bit_much: 0, too_much: 0 };
  for (const meal of meals) counts[meal.verdict] += 1;
  return counts;
}

export function waistToHeight(waistCm: number | null, heightCm: number | null): number | null {
  if (waistCm === null || heightCm === null || heightCm <= 0) return null;
  return Math.round((waistCm / heightCm) * 1000) / 1000;
}

/** Cintura saludable de referencia: menos de la mitad de la altura. */
export function healthyWaistLimit(heightCm: number | null): number | null {
  return heightCm === null ? null : Math.round(heightCm * 5) / 10;
}
