import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { diet } from '@/api/client';
import {
  CARB_LABELS,
  DIET_TIME_ZONE,
  healthyWaistLimit,
  MEAL_VERDICTS,
  PROTEIN_LABELS,
  VERDICT_LABELS,
  type DietSummary,
  type Meal,
} from '@/domain/diet';
import { formatTodayHeader } from '@/format';
import { confirm } from '@/ui/confirm';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/diet')({
  component: DietPage,
});

const QUERY_KEY = ['diet', 'summary'];
const DEFAULT_WAIST_CM = 90;

const timeFormat = new Intl.DateTimeFormat('es-AR', { timeZone: DIET_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: false });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const decimal = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function DietPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  usePageTitle('Dieta');
  const summary = useQuery({ queryKey: QUERY_KEY, queryFn: () => diet.summary(7) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const remove = useMutation({ mutationFn: (id: number) => diet.deleteMeal(id), onSettled: refresh });

  const askRemove = (meal: Meal) => confirm({
    title: '¿Sacar este plato?',
    message: `«${meal.title}» deja de contar en el día.`,
    actions: [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'No lo comí', style: 'destructive', onPress: () => remove.mutate(meal.id) },
    ],
  });

  const data = summary.data;
  const todayMeals = data ? data.meals.filter((meal) => meal.day === data.today).reverse() : [];

  return (
    <main className="page">
      <button type="button" className="back" onClick={() => router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' })}>← Inicio</button>
      <p className="kicker">{formatTodayHeader()}</p>
      <h1 className="hero">Dieta</h1>
      <p className="lead">Mandale la foto del plato a Claude con el conector Rutina. El veredicto queda anotado acá.</p>
      {summary.isError ? <p className="error" role="alert">{summary.error instanceof Error ? summary.error.message : 'No pudimos cargar la dieta.'}</p> : null}
      {summary.isPending ? <p className="note">Cargando…</p> : null}
      {data ? (
        <>
          <section className="diet-section">
            <h2 className="section">Hoy</h2>
            <div className="diet-card">
              {todayMeals.length === 0 ? (
                <p className="note" style={{ padding: '14px 0' }}>Todavía no hay platos hoy.</p>
              ) : todayMeals.map((meal) => (
                <div className="meal-row" key={meal.id}>
                  <span className={`verdict-dot verdict-${meal.verdict}`} aria-hidden="true" />
                  <div>
                    <p className="meal-name">{meal.title}</p>
                    <p className="meal-sub">
                      {timeFormat.format(new Date(meal.eatenAt))} · {VERDICT_LABELS[meal.verdict]} · proteína {PROTEIN_LABELS[meal.protein]} · carbohidratos {CARB_LABELS[meal.carbs]}
                    </p>
                    {meal.note ? <p className="meal-note">{meal.note}</p> : null}
                  </div>
                  <button type="button" className="meal-remove" onClick={() => askRemove(meal)}>No lo comí</button>
                </div>
              ))}
            </div>
          </section>
          <WeekCard summary={data} />
          <WaistCard summary={data} onSaved={refresh} />
        </>
      ) : null}
    </main>
  );
}

function WeekCard({ summary }: { summary: DietSummary }) {
  const total = summary.meals.length;
  const okShare = total ? Math.round((summary.counts.ok / total) * 100) : 0;
  return (
    <section className="diet-section">
      <h2 className="section">Últimos 7 días</h2>
      <div className="diet-card pad">
        <div className="week-bar" role="img" aria-label={`${summary.counts.ok} bien, ${summary.counts.a_bit_much} un poco mucho, ${summary.counts.too_much} mucho`}>
          {MEAL_VERDICTS.filter((verdict) => summary.counts[verdict] > 0).map((verdict) => (
            <span key={verdict} className={`verdict-${verdict}`} style={{ flex: summary.counts[verdict] }} />
          ))}
        </div>
        <div className="week-legend">
          {MEAL_VERDICTS.map((verdict) => (
            <span key={verdict}><span className={`verdict-dot verdict-${verdict}`} />{summary.counts[verdict]} {VERDICT_LABELS[verdict].toLowerCase()}</span>
          ))}
        </div>
        <p className="note">{total ? `${okShare} % de los platos estuvieron bien.` : 'Sin platos en la semana.'}</p>
      </div>
    </section>
  );
}

function WaistCard({ summary, onSaved }: { summary: DietSummary; onSaved: () => void }) {
  const latest = summary.waist.length ? summary.waist[summary.waist.length - 1] : null;
  const first = summary.waist[0] ?? null;
  const [draft, setDraft] = useState<number | null>(null);
  const [height, setHeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? latest?.cm ?? DEFAULT_WAIST_CM;
  const limit = healthyWaistLimit(summary.heightCm);

  const saveWaist = useMutation({
    mutationFn: () => diet.logWaist(value),
    onSuccess: () => { setDraft(null); setError(null); onSaved(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar la cintura.'),
  });
  const saveHeight = useMutation({
    mutationFn: () => diet.setHeight(Number(height.replace(',', '.'))),
    onSuccess: () => { setHeight(''); setError(null); onSaved(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar la altura.'),
  });
  const step = (delta: number) => setDraft(Math.round((value + delta) * 10) / 10);

  return (
    <section className="diet-section">
      <h2 className="section">Cintura · cada 2 semanas</h2>
      <div className="diet-card pad">
        {latest ? (
          <div className="diet-row">
            <p className="waist-value">{decimal(latest.cm)} <small>cm</small></p>
            {first && first.id !== latest.id ? (
              <p className="note">{latest.cm <= first.cm ? '−' : '+'}{decimal(Math.abs(latest.cm - first.cm))} cm desde el {shortDay(first.day)}</p>
            ) : null}
          </div>
        ) : <p className="note">Todavía no hay medidas. Medila a la altura del ombligo, en ayunas.</p>}
        {latest && limit !== null ? (
          <p className="note">
            {latest.cm < limit
              ? `Por debajo de la mitad de tu altura (${decimal(limit)} cm). Rango saludable.`
              : `Meta saludable: menos de ${decimal(limit)} cm. Te faltan ${decimal(latest.cm - limit)} cm.`}
          </p>
        ) : null}
        <div className="diet-row">
          <div className="stepper">
            <button type="button" aria-label="Menos medio centímetro" onClick={() => step(-0.5)}>−</button>
            <output aria-live="polite">{decimal(value)}</output>
            <button type="button" aria-label="Más medio centímetro" onClick={() => step(0.5)}>+</button>
          </div>
          <button type="button" className="diet-save" disabled={saveWaist.isPending} onClick={() => saveWaist.mutate()}>
            {saveWaist.isPending ? 'Guardando…' : 'Guardar medida'}
          </button>
        </div>
        {summary.heightCm === null ? (
          <div className="diet-row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              inputMode="numeric"
              placeholder="Tu altura en cm, para la meta"
              aria-label="Altura en centímetros"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
            <button type="button" className="diet-save" disabled={!height || saveHeight.isPending} onClick={() => saveHeight.mutate()}>Guardar altura</button>
          </div>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
