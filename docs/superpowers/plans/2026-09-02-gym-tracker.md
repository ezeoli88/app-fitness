# Rutina — Implementation Plan

> Este plan es de septiembre de 2026 y describe la app Android con SQLite local. La app actual es solo web: la fuente de datos es el Worker y D1. No lo uses como guía de implementación.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Expo personal para tachar series de una rutina de 3 días, recordar cuál se cerró última, y listar sesiones recientes.

**Architecture:** Plantilla (días + ejercicios) se siembra una vez desde `assets/rutina.json`. El progreso vive en SQLite (`sessions`). La lógica de tachar / completar es pura en `src/domain/session.ts` y se testea con Jest. Las pantallas (Inicio, Sesión, Historial) solo leen/escriben el repositorio y aplican esa lógica.

**Tech Stack:** Expo SDK actual + Expo Router + TypeScript + expo-sqlite + Jest (`jest-expo`). Sin cuenta, sin red, sin timer, sin peso.

**Spec:** No hay archivo de spec. El diseño acordado en conversación (2026-09-02) es la autoridad. Este plan lo materializa.

## Global Constraints

- Idioma UI: español. Copy exacta abajo; no inventar microcopy extra.
- Look **Caucho y tiza**: fondo `#12110F`, tarjeta `#1C1B18`, texto `#F3EFE6`, muted `#8A8578`, tiza `#E8E0D0`, latón `#D7C4A3`, borde `#3A372F`, borde última `#5A4E3A`. Una sola sans de sistema. Sin verde neón, sin ilustraciones.
- Tres días siempre visibles; el usuario elige cuál abrir. No hay “rutina del día” impuesta.
- “Última” = sesión con `completed_at` no nulo más reciente. Una sesión a medias no cuenta.
- Una sesión abierta máximo por `day_id`. Entrar reusa esa fila.
- Al cerrar un día se persiste la sesión y la próxima entrada a ese día crea una sesión nueva vacía.
- Series se tapan en cualquier orden (ejercicios y series). Tap destacha si el día no está cerrado.
- Un ejercicio se completa cuando todas sus series están `true`. El día se cierra cuando todos sus ejercicios lo están.
- Al cerrar: aviso “Día completo” con “Deshacer” ~5s. Deshacer reabre la sesión y destacha la serie que cerró. Sin diálogo de confirmación.
- Fechas: hora local del teléfono.
- Si SQLite no abre: recrear, re-sembrar JSON, mensaje “No se pudo leer el progreso. Rutina recargada.”
- Re-sembrar solo si `days` está vacío. Nunca pisar progreso existente.
- No editar la rutina en la app. No rest timer. No registrar peso ni reps reales (el `12` es meta visual).
- Tests de reglas en Jest, sin mocks de SQLite. expo-sqlite no corre en Jest: el repositorio se mantiene delgado.

### Copy exacta

| Uso | Texto |
|---|---|
| Título inicio | `Entrenar` |
| Sello | `Última` |
| Progreso abierto | `A medias` |
| Historial vacío | `Todavía no hay sesiones` |
| Sección historial | `Sesiones` |
| Ver más | `Ver más` |
| Cierre | `Día completo` |
| Undo | `Deshacer` |
| DB rota | `No se pudo leer el progreso. Rutina recargada.` |
| Back | `Inicio` |
| Progreso tarjeta a medias | `{doneEx} / {totalEx} ejercicios · {doneSets} / {totalSets} series` |
| Tarjeta última | `Completada el {fecha}` |
| Tarjeta limpia | `{n} ejercicios · {n} series` |
| Contador sesión | `{done} / {total} series` |

---

## File map

```
assets/rutina.json              # plantilla (copia de rutina.txt)
src/theme.ts                    # tokens de color y tipo
src/format.ts                   # fechas es-AR
src/domain/types.ts             # Day, Exercise, Session, RoutineTemplate
src/domain/session.ts           # lógica pura
src/domain/session.test.ts
src/db/schema.ts                # CREATE TABLE + migrate
src/db/seed.ts                  # import JSON → days/exercises
src/db/gymDb.ts                 # repositorio
app/_layout.tsx                 # SQLiteProvider + fondo
app/index.tsx                   # inicio
app/session/[dayId].tsx         # sesión
app/history.tsx                 # historial completo
```

---

### Task 1: Scaffold Expo + Jest + plantilla JSON

**Files:**
- Create: entire Expo app in repo root (keep `rutina.txt` and `docs/`)
- Create: `assets/rutina.json`
- Create: `src/domain/.gitkeep` (placeholder until Task 2)
- Modify: `package.json` scripts/jest, `app.json` name
- Test: `npx tsc --noEmit` and `npm test -- --watchAll=false` (empty suite OK)

**Interfaces:**
- Consumes: `rutina.txt` at repo root
- Produces: Expo Router app; `assets/rutina.json` with the same object as `rutina.txt`; Jest preset `jest-expo`; dependency `expo-sqlite`

- [ ] **Step 1: Scaffold**

The directory already contains `rutina.txt`, `docs/`, `.superpowers/`. Create the app in place:

```bash
npx create-expo-app@latest . --template default --yes
```

If create-expo-app refuses a non-empty dir, scaffold to `_expo_tmp`, move files up (do not overwrite `rutina.txt` or `docs/`), delete `_expo_tmp`.

Then:

```bash
npx expo install expo-sqlite
npx expo install jest-expo jest @types/jest --dev
```

`package.json` scripts:

```json
{
  "test": "jest --watchAll=false",
  "start": "expo start"
}
```

Jest config (package.json or jest.config.js):

```json
{
  "preset": "jest-expo",
  "testMatch": ["**/*.test.ts", "**/*.test.tsx"]
}
```

`app.json` / `app.config`: `"name": "Rutina"`, `"slug": "rutina"`.

- [ ] **Step 2: Copy plantilla**

Create `assets/rutina.json` with this exact JSON (same as `rutina.txt`):

```json
{
  "nombre": "Rutina de hombre (3 días)",
  "diasPorSemana": 3,
  "ciclo": [1, 2, 3],
  "dias": [
    {
      "id": 1,
      "titulo": "Pecho y bíceps",
      "ejercicios": [
        { "nombre": "Press de banco plano", "series": 4, "reps": 12 },
        { "nombre": "Press de banco inclinado", "series": 4, "reps": 12 },
        { "nombre": "Press de banco declinado", "series": 4, "reps": 12 },
        { "nombre": "Apertura c/mancuernas", "series": 4, "reps": 12 },
        { "nombre": "Pullover", "series": 4, "reps": 12 },
        { "nombre": "Curl con barra", "series": 4, "reps": 12 },
        { "nombre": "Alternado c/mancuernas", "series": 4, "reps": 12 },
        { "nombre": "Banco scott con barra", "series": 4, "reps": 12 }
      ]
    },
    {
      "id": 2,
      "titulo": "Hombros y piernas",
      "ejercicios": [
        { "nombre": "Press tras nuca", "series": 4, "reps": 12 },
        { "nombre": "Press Arnold", "series": 4, "reps": 12 },
        { "nombre": "Vuelos laterales", "series": 4, "reps": 12 },
        { "nombre": "Vuelos frontales", "series": 4, "reps": 12 },
        { "nombre": "Vuelos posteriores", "series": 4, "reps": 12 },
        { "nombre": "Sentadillas", "series": 4, "reps": 15 },
        { "nombre": "Prensa 45°", "series": 4, "reps": 15 },
        { "nombre": "Extensión de cuádriceps", "series": 4, "reps": 15 },
        { "nombre": "Camilla femoral", "series": 4, "reps": 15 },
        { "nombre": "Piernas duras", "series": 4, "reps": 15 },
        { "nombre": "Gemelos sentado", "series": 4, "reps": 20 }
      ]
    },
    {
      "id": 3,
      "titulo": "Espalda y tríceps",
      "ejercicios": [
        { "nombre": "Polea al pecho", "series": 4, "reps": 12 },
        { "nombre": "Polea agarre cerrado al pecho", "series": 4, "reps": 12 },
        { "nombre": "Pullover", "series": 4, "reps": 12 },
        { "nombre": "Remo caballo agarre abierto", "series": 4, "reps": 12 },
        { "nombre": "Polea baja", "series": 4, "reps": 12 },
        { "nombre": "Press francés", "series": 4, "reps": 12 },
        { "nombre": "Extensión alternada c/mancuernas", "series": 4, "reps": 12 },
        { "nombre": "Extensión de tríceps c/polea", "series": 4, "reps": 12 }
      ]
    }
  ]
}
```

Add `.superpowers/` to `.gitignore` if missing.

Strip the default tabs/explore demo until only a blank `app/_layout.tsx` + `app/index.tsx` remain (placeholder text is fine; real UI is later tasks). Keep Expo Router.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm test
```

Expected: TypeScript clean; Jest runs (0 tests OK).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo Router, Jest, and routine JSON"
```

---

### Task 2: Lógica pura de sesión (TDD)

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/session.ts`
- Test: `src/domain/session.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 except the JSON shape (ids 1/2/3, series counts)
- Produces:

```ts
export type RoutineJson = {
  nombre: string;
  diasPorSemana: number;
  ciclo: number[];
  dias: {
    id: number;
    titulo: string;
    ejercicios: { nombre: string; series: number; reps: number }[];
  }[];
};

export type Day = { id: number; title: string; sort: number };
export type Exercise = {
  id: number;
  dayId: number;
  name: string;
  sets: number;
  reps: number;
  sort: number;
};
export type Session = {
  id: number;
  dayId: number;
  startedAt: string;
  completedAt: string | null;
  completedSets: Record<number, boolean[]>;
};

export function emptyMarks(setCount: number): boolean[];
export function toggleSet(marks: boolean[], setIndex: number): boolean[];
export function isExerciseComplete(marks: boolean[]): boolean;
export function ensureExerciseMarks(
  completedSets: Record<number, boolean[]>,
  exerciseId: number,
  setCount: number
): boolean[];
export function applyToggle(args: {
  completedSets: Record<number, boolean[]>;
  exerciseId: number;
  setIndex: number;
  setCount: number;
}): Record<number, boolean[]>;
export function isDayComplete(
  exercises: { id: number; sets: number }[],
  completedSets: Record<number, boolean[]>
): boolean;
export function countCompletedSets(completedSets: Record<number, boolean[]>): number;
export function totalSets(exercises: { sets: number }[]): number;
export function countCompletedExercises(
  exercises: { id: number; sets: number }[],
  completedSets: Record<number, boolean[]>
): number;
export function findClosingToggle(args: {
  exercises: { id: number; sets: number }[];
  before: Record<number, boolean[]>;
  after: Record<number, boolean[]>;
}): { exerciseId: number; setIndex: number } | null;
```

`toggleSet` copies the array, flips `setIndex`, ignores out-of-range indexes (return original). `applyToggle` uses `ensureExerciseMarks` then `toggleSet`. `isDayComplete` is true only if every exercise has `sets` marks and all are true. `findClosingToggle` returns the set that went `false → true` when `isDayComplete(after)` is true and `isDayComplete(before)` is false.

- [ ] **Step 1: Write failing tests**

`src/domain/session.test.ts`:

```ts
import {
  emptyMarks,
  toggleSet,
  isExerciseComplete,
  applyToggle,
  isDayComplete,
  countCompletedSets,
  totalSets,
  countCompletedExercises,
  findClosingToggle,
} from './session';

const pecs = [
  { id: 10, sets: 4 },
  { id: 11, sets: 4 },
];

test('emptyMarks is all false with the right length', () => {
  expect(emptyMarks(4)).toEqual([false, false, false, false]);
});

test('toggleSet flips one index and does not mutate', () => {
  const marks = emptyMarks(4);
  const next = toggleSet(marks, 2);
  expect(next).toEqual([false, false, true, false]);
  expect(marks).toEqual([false, false, false, false]);
});

test('toggleSet ignores out of range', () => {
  const marks = emptyMarks(2);
  expect(toggleSet(marks, 9)).toBe(marks);
  expect(toggleSet(marks, -1)).toBe(marks);
});

test('exercise completes only when every set is true', () => {
  expect(isExerciseComplete([true, true, true, false])).toBe(false);
  expect(isExerciseComplete([true, true, true, true])).toBe(true);
  expect(isExerciseComplete([])).toBe(false);
});

test('applyToggle can mark sets out of order', () => {
  let sets = {};
  sets = applyToggle({ completedSets: sets, exerciseId: 10, setIndex: 3, setCount: 4 });
  sets = applyToggle({ completedSets: sets, exerciseId: 10, setIndex: 0, setCount: 4 });
  expect(sets[10]).toEqual([true, false, false, true]);
});

test('day is not complete until every exercise is complete', () => {
  const half = { 10: [true, true, true, true], 11: [true, true, false, false] };
  expect(isDayComplete(pecs, half)).toBe(false);
  const done = { 10: [true, true, true, true], 11: [true, true, true, true] };
  expect(isDayComplete(pecs, done)).toBe(true);
});

test('missing exercise marks means day is not complete', () => {
  expect(isDayComplete(pecs, { 10: [true, true, true, true] })).toBe(false);
});

test('counts series and exercises', () => {
  const sets = { 10: [true, true, false, false], 11: [true, true, true, true] };
  expect(totalSets(pecs)).toBe(8);
  expect(countCompletedSets(sets)).toBe(6);
  expect(countCompletedExercises(pecs, sets)).toBe(1);
});

test('findClosingToggle returns the set that closed the day', () => {
  const before = { 10: [true, true, true, true], 11: [true, true, true, false] };
  const after = applyToggle({
    completedSets: before,
    exerciseId: 11,
    setIndex: 3,
    setCount: 4,
  });
  expect(findClosingToggle({ exercises: pecs, before, after })).toEqual({
    exerciseId: 11,
    setIndex: 3,
  });
});

test('findClosingToggle is null when the day is still open', () => {
  const before = { 10: emptyMarks(4), 11: emptyMarks(4) };
  const after = applyToggle({
    completedSets: before,
    exerciseId: 10,
    setIndex: 0,
    setCount: 4,
  });
  expect(findClosingToggle({ exercises: pecs, before, after })).toBeNull();
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
npm test -- src/domain/session.test.ts
```

Expected: FAIL, cannot find module `./session` or exports missing.

- [ ] **Step 3: Implement types + session**

`src/domain/types.ts` — export the types listed in Interfaces.

`src/domain/session.ts` — implement the functions so the tests pass. `toggleSet` returns the same array reference when index is out of range.

- [ ] **Step 4: Run tests — must pass**

```bash
npm test -- src/domain/session.test.ts
```

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: pure session rules for sets, day complete, and closing toggle"
```

---

### Task 3: SQLite schema, seed, repositorio

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/seed.ts`
- Create: `src/db/gymDb.ts`
- Create: `src/db/gymDb.test.ts` (tests of SQL string helpers / mapping only, no native SQLite)

**Interfaces:**
- Consumes: `RoutineJson`, `Day`, `Exercise`, `Session` from Task 2; `assets/rutina.json`
- Produces:

```ts
export const DATABASE_VERSION = 1;
export async function migrate(db: SQLiteDatabase): Promise<void>;
export async function seedIfEmpty(db: SQLiteDatabase, routine: RoutineJson): Promise<void>;

export type GymDb = {
  listDays(): Promise<Day[]>;
  listExercises(dayId: number): Promise<Exercise[]>;
  getOpenSession(dayId: number): Promise<Session | null>;
  getOrCreateOpenSession(dayId: number, exercises: Exercise[]): Promise<Session>;
  saveOpenSession(session: Session): Promise<void>;
  closeSession(sessionId: number, completedAtIso: string): Promise<void>;
  reopenSession(sessionId: number, completedSets: Record<number, boolean[]>): Promise<void>;
  lastCompleted(): Promise<(Session & { dayTitle: string }) | null>;
  listCompleted(limit: number): Promise<(Session & { dayTitle: string })[]>;
};

export function createGymDb(db: SQLiteDatabase): GymDb;
export function serializeSets(sets: Record<number, boolean[]>): string;
export function parseSets(raw: string): Record<number, boolean[]>;
```

Schema (in `migrate` when `user_version` is 0):

```sql
CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  sort INTEGER NOT NULL,
  FOREIGN KEY (day_id) REFERENCES days (id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  day_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  completed_sets TEXT NOT NULL,
  FOREIGN KEY (day_id) REFERENCES days (id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_day_open ON sessions (day_id, completed_at);
PRAGMA user_version = 1;
```

`getOrCreateOpenSession`: `SELECT ... WHERE day_id = ? AND completed_at IS NULL`. If none, INSERT with `completed_sets` = `{}` and `started_at` = `new Date().toISOString()`.

`lastCompleted`: `SELECT sessions.*, days.title as dayTitle FROM sessions JOIN days ON days.id = sessions.day_id WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1`.

`listCompleted`: same filter, `LIMIT ?`.

`closeSession`: set `completed_at`. `reopenSession`: set `completed_at = NULL` and write `completed_sets`.

Seed: if `(SELECT COUNT(*) FROM days)` is 0, insert each JSON day (`id`/`titulo`/`sort=index`) and its exercises (`sort=index`). If count > 0, no-op.

- [ ] **Step 1: Failing tests for serialize/parse and seed emptiness helper**

```ts
import { parseSets, serializeSets } from './gymDb';

test('serializeSets roundtrips', () => {
  const sets = { 1: [true, false], 2: [true, true, true, true] };
  expect(parseSets(serializeSets(sets))).toEqual(sets);
});

test('parseSets empty object for blank', () => {
  expect(parseSets('')).toEqual({});
  expect(parseSets('{}')).toEqual({});
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- src/db/gymDb.test.ts
```

Expected: FAIL, module missing.

- [ ] **Step 3: Implement schema.ts, seed.ts, gymDb.ts**

`migrate` uses `PRAGMA user_version` then the SQL above.

`createGymDb` returns the methods. Use `db.getAllAsync` / `getFirstAsync` / `runAsync`.

- [ ] **Step 4: Tests pass**

```bash
npm test -- src/db/gymDb.test.ts src/domain/session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat: sqlite schema, seed from JSON, and gym repository"
```

---

### Task 4: Tema + shell + SQLiteProvider

**Files:**
- Create: `src/theme.ts`
- Create: `src/format.ts`
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx` (temporary: show “Entrenar” on theme background so the shell is visible)

**Interfaces:**
- Consumes: `migrate`, `seedIfEmpty`, `createGymDb`; `assets/rutina.json`
- Produces:

```ts
export const colors = {
  bg: '#12110F',
  card: '#1C1B18',
  text: '#F3EFE6',
  muted: '#8A8578',
  chalk: '#E8E0D0',
  brass: '#D7C4A3',
  border: '#3A372F',
  lastBorder: '#5A4E3A',
};
export function formatHistoryDate(iso: string): string; // "lun 1"
export function formatCompletedLong(iso: string): string; // "lunes 1"
```

`formatHistoryDate` / `formatCompletedLong` use `toLocaleDateString('es-AR', …)` plus weekday. Tests:

```ts
test('formatHistoryDate uses short weekday and day number', () => {
  const iso = '2026-08-31T18:00:00.000Z';
  const text = formatHistoryDate(iso);
  expect(text).toMatch(/lun|mar|mié|mie|jue|vie|sáb|sab|dom/i);
  expect(text).toMatch(/\d/);
});
```

`app/_layout.tsx`:

- `SQLiteProvider` `databaseName="rutina.db"` `onInit={async (db) => { await migrate(db); await seedIfEmpty(db, routine); }}` `onError` recreates: delete/reopen is acceptable via `onInit` try/catch that `execAsync('DROP TABLE IF EXISTS ...')` then migrate+seed again is too destructive on first error — instead: wrap migrate+seed in try/catch; on failure `await db.execAsync('PRAGMA user_version = 0');` drop the three tables if exist, migrate, seed, and set a React context flag `recoveryMessage`.
- Simpler recovery: `onError` on SQLiteProvider logs; a `RecoveryBanner` reads context. Implement a `DbReady` wrapper: try migrate+seed; catch → drop tables `sessions`, `exercises`, `days`, migrate, seed, `recovered=true`.
- Stack navigator: `index`, `session/[dayId]`, `history`. `contentStyle` background `colors.bg`. StatusBar light.

Provide GymDb through context:

```ts
export const GymContext = createContext<GymDb | null>(null);
export function useGym(): GymDb;
```

`useGym` throws if null.

- [ ] **Step 1: format.test.ts failing**
- [ ] **Step 2: npm test — fail**
- [ ] **Step 3: theme.ts, format.ts, _layout.tsx**
- [ ] **Step 4: tests pass; app launches with dark bg**
- [ ] **Step 5: Commit** `feat: chalk theme, date format, and sqlite provider shell`

---

### Task 5: Inicio + historial

**Files:**
- Modify: `app/index.tsx`
- Create: `app/history.tsx`
- Create: `src/components/DayCard.tsx`
- Create: `src/components/HistoryList.tsx`

**Interfaces:**
- Consumes: `useGym`, `colors`, formatters, domain counts
- Produces: Home lists 3 day cards in sort order. Each card:
  - open session → label `A medias`, bar = completedSets/totalSets, subtitle `{doneEx} / {totalEx} ejercicios · {doneSets} / {totalSets} series`. Press → `/session/{id}`
  - else if this day is `lastCompleted().dayId` → label `Última`, subtitle `Completada el {formatCompletedLong}`. Press → `/session/{id}` (new empty session via getOrCreate)
  - else → subtitle `{n} ejercicios · {n} series`. Press → `/session/{id}`
- History preview: last 3 from `listCompleted(3)`. Empty: `Todavía no hay sesiones`. Link `Ver más` → `/history` which shows `listCompleted(50)`.
- Header: small uppercase date (today) + title `Entrenar`.

No extra buttons. Cards are the hit target (min height ~72).

- [ ] **Step 1: Implement DayCard + screens using real copy**
- [ ] **Step 2: Typecheck** `npx tsc --noEmit`
- [ ] **Step 3: Commit** `feat: home day cards, last badge, and history list`

---

### Task 6: Pantalla de sesión + Deshacer

**Files:**
- Create: `app/session/[dayId].tsx`
- Create: `src/components/SetPips.tsx`
- Create: `src/components/UndoToast.tsx`

**Interfaces:**
- Consumes: `useGym`, `applyToggle`, `isExerciseComplete`, `isDayComplete`, `findClosingToggle`, `countCompletedSets`, `totalSets`
- Produces:

`SetPips`: `{ marks: boolean[]; onToggle(index: number): void }` — row of circles 44pt, chalk fill if true, chalk border if this is the “next” empty, muted border otherwise. All pips tappable in any order.

Session screen:
- Load day, exercises, `getOrCreateOpenSession`.
- Header: `← Inicio` (`router.back()`), title = day.title, `{done} / {total} series`.
- List all exercises. Completed exercise (all pips true) opacity 0.45.
- On pip tap: compute `after = applyToggle(...)`. `saveOpenSession`. If `findClosingToggle` non-null: `closeSession(id, new Date().toISOString())`, show toast 5s with `{ message: 'Día completo', action: 'Deshacer' }`. If undo: `reopenSession(id, after with that set flipped back)` then stay on screen with updated marks. If toast expires: `router.replace('/')`.
- Leaving via `← Inicio` does not clear progress.
- Do not allow toggles while toast is visible except Deshacer.

- [ ] **Step 1: Implement session screen + pips + toast**
- [ ] **Step 2: tsc clean; domain tests still pass**
- [ ] **Step 3: Commit** `feat: session set pips, auto-close day, and undo toast`

---

## Verification (después de Task 6)

Manual en Expo Go:

1. Primera apertura: 3 tarjetas limpias, “Todavía no hay sesiones”.
2. Abrir Pecho, marcar series del ejercicio 2 dejando el 1 en 0 (máquina ocupada). Atrás. Inicio muestra Pecho “A medias”.
3. Matar la app, reabrir: Pecho sigue a medias.
4. Completar Pecho; en el toast tocar Deshacer: sigue abierto, la última serie destachada.
5. Completar de nuevo, dejar pasar el toast: Inicio con Última en Pecho, historial con una fila.
6. Entrar otra vez a Pecho: círculos vacíos.
7. Completar Hombros: Última se mueve a Hombros; historial tiene 2 filas.

```bash
npm test
npx tsc --noEmit
```

---

## Self-review

- Inicio 3 tarjetas, sello Última, historial corto → Task 5
- Sesión series tappeables, orden libre, cierre al último set → Task 6 + Task 2
- Deshacer 5s → Task 6
- SQLite 3 tablas, seed una vez, una abierta por día → Task 3
- Look caucho y tiza + copy ES → Task 4–6 / Global Constraints
- DB corrupta → Task 4 recovery
- No hay placeholders de implementación
- Nombres estables: `applyToggle`, `findClosingToggle`, `getOrCreateOpenSession`, `reopenSession`
