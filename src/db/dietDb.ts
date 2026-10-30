import type { SqlDriver } from '@/db/core/driver';
import {
  addDays,
  countVerdicts,
  isLocalDay,
  localDay,
  MAX_HEIGHT_CM,
  MAX_WAIST_CM,
  MIN_HEIGHT_CM,
  MIN_WAIST_CM,
  waistToHeight,
  type DietSummary,
  type Meal,
  type MealInput,
  type WaistMeasurement,
} from '@/domain/diet';
import { DomainError } from '@/domain/errors';

type MealRow = {
  id: number;
  eaten_at: string;
  day: string;
  title: string;
  verdict: Meal['verdict'];
  protein: Meal['protein'];
  carbs: Meal['carbs'];
  note: string | null;
};

const MEAL_COLUMNS = 'id, eaten_at, day, title, verdict, protein, carbs, note';
const MAX_SUMMARY_DAYS = 60;
/** La altura vive en `settings`, fuera de la API genérica de preferencias para validarla aquí. */
const HEIGHT_KEY = 'heightCm';
const WAIST_HISTORY = 12;

function toMeal(row: MealRow): Meal {
  return {
    id: row.id,
    eatenAt: row.eaten_at,
    day: row.day,
    title: row.title,
    verdict: row.verdict,
    protein: row.protein,
    carbs: row.carbs,
    note: row.note,
  };
}

export type DietDb = {
  logMeal(input: MealInput, now?: Date): Promise<Meal>;
  deleteMeal(id: number): Promise<boolean>;
  logWaist(cm: number, day?: string, now?: Date): Promise<WaistMeasurement>;
  setHeight(cm: number): Promise<void>;
  getHeight(): Promise<number | null>;
  summary(days: number, now?: Date): Promise<DietSummary>;
};

export function createDietDb(driver: SqlDriver): DietDb {
  async function getHeight(): Promise<number | null> {
    const row = await driver.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', HEIGHT_KEY);
    const value = row === null ? NaN : Number(row.value);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  return {
    async logMeal(input, now = new Date()) {
      const title = input.title.trim();
      if (!title) throw new DomainError('El plato necesita un nombre.', 422);
      const eatenAt = input.eatenAt ? new Date(input.eatenAt) : now;
      if (Number.isNaN(eatenAt.getTime())) throw new DomainError('La hora del plato no es válida.', 422);
      const note = input.note?.trim() || null;
      const day = localDay(eatenAt);
      const result = await driver.run(
        'INSERT INTO meals (eaten_at, day, title, verdict, protein, carbs, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        eatenAt.toISOString(), day, title, input.verdict, input.protein, input.carbs, note,
      );
      return {
        id: result.lastInsertRowId,
        eatenAt: eatenAt.toISOString(),
        day,
        title,
        verdict: input.verdict,
        protein: input.protein,
        carbs: input.carbs,
        note,
      };
    },

    async deleteMeal(id) {
      const result = await driver.run('DELETE FROM meals WHERE id = ?', id);
      return result.changes > 0;
    },

    async logWaist(cm, day, now = new Date()) {
      if (!Number.isFinite(cm) || cm < MIN_WAIST_CM || cm > MAX_WAIST_CM) {
        throw new DomainError(`La cintura tiene que estar entre ${MIN_WAIST_CM} y ${MAX_WAIST_CM} cm.`, 422);
      }
      const measuredOn = day ?? localDay(now);
      if (!isLocalDay(measuredOn)) throw new DomainError('La fecha de la medida no es válida.', 422);
      const rounded = Math.round(cm * 10) / 10;
      const result = await driver.run('INSERT INTO waist_measurements (day, cm) VALUES (?, ?)', measuredOn, rounded);
      return { id: result.lastInsertRowId, day: measuredOn, cm: rounded };
    },

    async setHeight(cm) {
      if (!Number.isFinite(cm) || cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) {
        throw new DomainError(`La altura tiene que estar entre ${MIN_HEIGHT_CM} y ${MAX_HEIGHT_CM} cm.`, 422);
      }
      await driver.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', HEIGHT_KEY, String(Math.round(cm)));
    },

    getHeight,

    async summary(days, now = new Date()) {
      const span = Math.min(Math.max(Math.trunc(days), 1), MAX_SUMMARY_DAYS);
      const today = localDay(now);
      const from = addDays(today, -(span - 1));
      const [rows, waistRows, heightCm] = await Promise.all([
        driver.all<MealRow>(`SELECT ${MEAL_COLUMNS} FROM meals WHERE day >= ? ORDER BY eaten_at, id`, from),
        driver.all<WaistMeasurement>(
          'SELECT id, day, cm FROM waist_measurements ORDER BY day DESC, id DESC LIMIT ?',
          WAIST_HISTORY,
        ),
        getHeight(),
      ]);
      const meals = rows.map(toMeal);
      const waist = waistRows.reverse();
      const latest = waist.length ? waist[waist.length - 1].cm : null;
      return {
        today,
        from,
        meals,
        counts: countVerdicts(meals),
        waist,
        heightCm,
        waistToHeight: waistToHeight(latest, heightCm),
      };
    },
  };
}
