import { useForm, useStore } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useBlocker, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { gym } from '@/api/client';
import { validateRoutineDraft } from '@/domain/routine';
import { formatOptionalWeight, parseWeightInput } from '@/domain/series';
import type { RoutineDraft } from '@/domain/types';
import { refreshTraining } from '@/query';
import { confirm } from '@/ui/confirm';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/routine-editor/$routineId')({
  component: RoutineEditorPage,
});

function blankRoutine(): RoutineDraft {
  return {
    id: null,
    title: '',
    level: 'personalizada',
    sort: 0,
    days: [{ id: null, title: 'Día 1', sort: 0, exercises: [{ id: null, name: '', sets: 3, reps: 10, sort: 0, targetWeightKg: null }] }],
  };
}

/** Texto del campo a número; NaN si todavía no es un peso válido (p. ej. "12,"). */
function readWeight(text: string): number | null {
  try {
    return parseWeightInput(text);
  } catch {
    return Number.NaN;
  }
}

function TargetWeightField({ label, value, onChange }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(() => formatOptionalWeight(value));
  // Si el valor cambió desde afuera (reordenar, reiniciar), se muestra ese valor.
  const shown = Object.is(readWeight(text), value) ? text : formatOptionalWeight(Number.isNaN(value) ? null : value);
  return (
    <div className="number-field">
      <span className="label">Peso objetivo (kg)</span>
      <input
        className="numeric"
        inputMode="decimal"
        aria-label={label}
        placeholder="—"
        value={shown}
        onChange={(event) => {
          setText(event.target.value);
          onChange(readWeight(event.target.value));
        }}
      />
    </div>
  );
}

function RoutineEditorPage() {
  const { routineId } = Route.useParams();
  const isNew = routineId === 'new';
  usePageTitle('Editor');
  const draft = useQuery({
    queryKey: ['routine-draft', routineId],
    queryFn: () => gym.getRoutineDraft(routineId),
    enabled: !isNew,
  });

  if (!isNew && draft.isPending) {
    return (
      <main className="page can-wide">
        <h1 className="hero">Editar rutina</h1>
        <p className="note">Cargando…</p>
      </main>
    );
  }
  if (!isNew && draft.isError) {
    return (
      <main className="page can-wide">
        <h1 className="hero">Editar rutina</h1>
        <p className="error" role="alert">{draft.error instanceof Error ? draft.error.message : 'No se pudo abrir la rutina.'}</p>
      </main>
    );
  }
  if (!isNew && draft.isSuccess && !draft.data) {
    return (
      <main className="page can-wide">
        <h1 className="hero">Editar rutina</h1>
        <p className="error" role="alert">No encontramos esa rutina. Actualizá la lista y probá otra vez.</p>
      </main>
    );
  }

  return <EditorForm initial={isNew ? blankRoutine() : draft.data!} />;
}

function EditorForm({ initial }: { initial: RoutineDraft }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const validation = validateRoutineDraft(value);
      if (validation) {
        setError(validation);
        return;
      }
      setError(null);
      try {
        await gym.saveRoutine(value);
        formApi.reset(value);
        await refreshTraining();
        await navigate({ to: '/routines', replace: true });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo guardar la rutina.');
      }
    },
  });
  const days = useStore(form.store, (state) => state.values.days);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const blocker = useBlocker({
    shouldBlockFn: () => form.store.state.isDirty && !form.store.state.isSubmitting,
    enableBeforeUnload: () => form.store.state.isDirty && !form.store.state.isSubmitting,
    withResolver: true,
  });
  const prompted = useRef(false);

  useEffect(() => {
    if (blocker.status !== 'blocked') {
      prompted.current = false;
      return;
    }
    if (prompted.current) return;
    prompted.current = true;
    confirm({
      title: 'Cambios sin guardar',
      message: 'Podés guardar la rutina antes de salir.',
      actions: [
        { text: 'Seguir editando', style: 'cancel', onPress: () => blocker.reset() },
        { text: 'Descartar cambios', style: 'destructive', onPress: () => blocker.proceed() },
      ],
    });
  }, [blocker]);

  const updateDays = (updater: (current: RoutineDraft['days']) => RoutineDraft['days']) => {
    form.setFieldValue('days', updater(form.getFieldValue('days')));
  };

  const moveDay = (index: number, amount: number) => updateDays((current) => {
    const next = current.slice();
    const destination = index + amount;
    if (destination < 0 || destination >= next.length) return current;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    return next.map((day, sort) => ({ ...day, sort, title: /^Día \d+$/.test(day.title) ? `Día ${sort + 1}` : day.title }));
  });

  const moveExercise = (dayIndex: number, exerciseIndex: number, amount: number) => updateDays((current) => current.map((day, index) => {
    if (index !== dayIndex) return day;
    const exercises = day.exercises.slice();
    const destination = exerciseIndex + amount;
    if (destination < 0 || destination >= exercises.length) return day;
    [exercises[exerciseIndex], exercises[destination]] = [exercises[destination]!, exercises[exerciseIndex]!];
    return { ...day, exercises: exercises.map((exercise, sort) => ({ ...exercise, sort })) };
  }));

  return (
    <main className="page can-wide">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}>
        <button type="button" className="back" onClick={() => void navigate({ to: '/routines' })}>← Rutinas</button>
        <h1 className="hero">{initial.id ? 'Editar rutina' : 'Nueva rutina'}</h1>
        <form.Field name="title">
          {(field) => (
            <>
              <label className="label" htmlFor={field.name}>Nombre</label>
              <input
                id={field.name}
                className="input"
                aria-label="Nombre de la rutina"
                placeholder="Ej.: Fuerza de tres días"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </>
          )}
        </form.Field>
        <form.Field name="level">
          {(field) => (
            <>
              <label className="label" htmlFor={field.name}>Nivel</label>
              <input
                id={field.name}
                className="input"
                aria-label="Nivel de la rutina"
                placeholder="personalizada"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </>
          )}
        </form.Field>

        <div className="section-heading">
          <h2 className="section">Días</h2>
          <button
            type="button"
            className="link"
            onClick={() => updateDays((current) => [...current, {
              id: null,
              title: `Día ${current.length + 1}`,
              sort: current.length,
              exercises: [{ id: null, name: '', sets: 3, reps: 10, sort: 0, targetWeightKg: null }],
            }])}>
            + Agregar día
          </button>
        </div>

        <div className="day-grid">
          {days.map((day, dayIndex) => (
            <section key={day.id ?? `new-day-${dayIndex}`} className="day-editor">
              <div className="day-header">
                <input
                  className="day-title-input"
                  aria-label={`Nombre del día ${dayIndex + 1}`}
                  value={day.title}
                  onChange={(event) => updateDays((current) => current.map((item, index) => index === dayIndex ? { ...item, title: event.target.value } : item))}
                />
                <div className="order">
                  <button type="button" className="link" aria-label="Subir día" disabled={dayIndex === 0} onClick={() => moveDay(dayIndex, -1)}>↑</button>
                  <button type="button" className="link" aria-label="Bajar día" disabled={dayIndex === days.length - 1} onClick={() => moveDay(dayIndex, 1)}>↓</button>
                  <button type="button" className="remove" aria-label="Quitar día" onClick={() => updateDays((current) => current.filter((_, index) => index !== dayIndex).map((item, sort) => ({ ...item, sort })))}>Quitar</button>
                </div>
              </div>
              {day.exercises.map((exercise, exerciseIndex) => (
                <div key={exercise.id ?? `new-exercise-${dayIndex}-${exerciseIndex}`} className="exercise">
                  <input
                    className="input"
                    aria-label={`Ejercicio ${exerciseIndex + 1} del día ${dayIndex + 1}`}
                    placeholder="Nombre del ejercicio"
                    value={exercise.name}
                    onChange={(event) => updateDays((current) => current.map((item, index) => index === dayIndex
                      ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, name: event.target.value } : row) }
                      : item))}
                  />
                  <div className="exercise-meta">
                    <div className="number-field">
                      <span className="label">Series</span>
                      <input
                        className="numeric"
                        inputMode="numeric"
                        aria-label={`Series previstas para ${exercise.name || 'el ejercicio'}`}
                        value={exercise.sets ? String(exercise.sets) : ''}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/\D/g, '');
                          updateDays((current) => current.map((item, index) => index === dayIndex
                            ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, sets: raw ? Number(raw) : 0 } : row) }
                            : item));
                        }}
                      />
                    </div>
                    <div className="number-field">
                      <span className="label">Repeticiones</span>
                      <input
                        className="numeric"
                        inputMode="numeric"
                        aria-label={`Repeticiones previstas para ${exercise.name || 'el ejercicio'}`}
                        value={exercise.reps ? String(exercise.reps) : ''}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/\D/g, '');
                          updateDays((current) => current.map((item, index) => index === dayIndex
                            ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, reps: raw ? Number(raw) : 0 } : row) }
                            : item));
                        }}
                      />
                    </div>
                    <TargetWeightField
                      label={`Peso objetivo en kilogramos para ${exercise.name || 'el ejercicio'}`}
                      value={exercise.targetWeightKg ?? null}
                      onChange={(targetWeightKg) => updateDays((current) => current.map((item, index) => index === dayIndex
                        ? { ...item, exercises: item.exercises.map((row, rowIndex) => rowIndex === exerciseIndex ? { ...row, targetWeightKg } : row) }
                        : item))}
                    />
                    <div className="order">
                      <button type="button" className="link" aria-label="Subir ejercicio" disabled={exerciseIndex === 0} onClick={() => moveExercise(dayIndex, exerciseIndex, -1)}>↑</button>
                      <button type="button" className="link" aria-label="Bajar ejercicio" disabled={exerciseIndex === day.exercises.length - 1} onClick={() => moveExercise(dayIndex, exerciseIndex, 1)}>↓</button>
                      <button
                        type="button"
                        className="remove"
                        aria-label="Quitar ejercicio"
                        onClick={() => updateDays((current) => current.map((item, index) => index === dayIndex
                          ? { ...item, exercises: item.exercises.filter((_, rowIndex) => rowIndex !== exerciseIndex).map((row, sort) => ({ ...row, sort })) }
                          : item))}>
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="link add-exercise"
                onClick={() => updateDays((current) => current.map((item, index) => index === dayIndex
                  ? { ...item, exercises: [...item.exercises, { id: null, name: '', sets: 3, reps: 10, sort: item.exercises.length, targetWeightKg: null }] }
                  : item))}>
                + Agregar ejercicio
              </button>
            </section>
          ))}
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button type="submit" className="save" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar rutina'}</button>
      </form>
    </main>
  );
}
