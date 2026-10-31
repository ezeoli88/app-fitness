import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { diet } from '@/api/client';
import {
  CARB_LABELS,
  DIET_TIME_ZONE,
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

const DIET_SUMMARY_KEY = ['diet', 'summary'];

const timeFormat = new Intl.DateTimeFormat('es-AR', { timeZone: DIET_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: false });

function DietPage() {
  const queryClient = useQueryClient();
  usePageTitle('Dieta');
  const summary = useQuery({ queryKey: DIET_SUMMARY_KEY, queryFn: () => diet.summary(7) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: DIET_SUMMARY_KEY });
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
