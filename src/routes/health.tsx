import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { diet, labs } from '@/api/client';
import { WaistCard } from '@/components/WaistCard';
import {
  FOCUS_LAB_KEYS,
  LAB_CATEGORIES,
  LAB_CATEGORY_LABELS,
  LAB_FLAG_LABELS,
  labSeries,
  type LabReport,
  type LabSeries,
} from '@/domain/labs';
import { formatTodayHeader } from '@/format';
import { confirm } from '@/ui/confirm';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/health')({
  component: HealthPage,
});

const LABS_KEY = ['labs'];
const DIET_KEY = ['diet', 'summary'];

const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const amount = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 2 });

function HealthPage() {
  usePageTitle('Salud');
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: DIET_KEY, queryFn: () => diet.summary(7) });
  const reports = useQuery({ queryKey: LABS_KEY, queryFn: () => labs.list() });

  return (
    <main className="page">
      <p className="kicker">{formatTodayHeader()}</p>
      <h1 className="hero">Salud</h1>
      <p className="lead">Cintura y análisis de sangre. Mandale el PDF o una foto del análisis a Claude con el conector Rutina y queda guardado acá.</p>
      {summary.data ? <WaistCard summary={summary.data} onSaved={() => queryClient.invalidateQueries({ queryKey: DIET_KEY })} /> : null}
      {reports.isError ? <p className="error" role="alert">{reports.error instanceof Error ? reports.error.message : 'No pudimos cargar los análisis.'}</p> : null}
      {reports.isPending ? <p className="note">Cargando…</p> : null}
      {reports.data ? <Labs reports={reports.data.reports} /> : null}
    </main>
  );
}

function Labs({ reports }: { reports: LabReport[] }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: number) => labs.deleteReport(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LABS_KEY }),
  });

  if (reports.length === 0) {
    return (
      <section className="diet-section">
        <h2 className="section">Análisis de sangre</h2>
        <div className="diet-card pad">
          <p className="meal-name">Todavía no hay análisis.</p>
          <p className="note">En el chat de Claude adjuntá el PDF o una foto del estudio. Claude lee todos los valores con su rango de referencia y los guarda; acá vas a ver cómo evoluciona cada uno.</p>
        </div>
      </section>
    );
  }

  const latest = reports[0];
  const series = labSeries(reports);
  const focus = FOCUS_LAB_KEYS.map((key) => series.find((item) => item.key === key)).filter((item) => item !== undefined);
  const outside = latest.results.filter((result) => result.flag === 'low' || result.flag === 'high').length;

  const askRemove = (report: LabReport) => confirm({
    title: '¿Borrar este estudio?',
    message: `Se borran los ${report.results.length} valores del ${longDay(report.day)}.`,
    actions: [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => remove.mutate(report.id) },
    ],
  });

  return (
    <>
      <section className="diet-section">
        <h2 className="section">Último análisis</h2>
        <div className="diet-card pad">
          <div className="diet-row">
            <p className="waist-value lab-date">{longDay(latest.day)}</p>
            <span className={`lab-pill ${outside ? 'flag-high' : 'flag-normal'}`}>
              {outside ? `${outside} fuera de rango` : 'Todo en rango'}
            </span>
          </div>
          <p className="note">
            {latest.lab ? `${latest.lab} · ` : ''}{latest.results.length} valores{reports.length > 1 ? ` · ${reports.length} estudios en total` : ''}
          </p>
          {latest.note ? <p className="note">{latest.note}</p> : null}
        </div>
      </section>

      {focus.length ? (
        <section className="diet-section">
          <h2 className="section">Lo que más mira tu objetivo</h2>
          <div className="diet-card">
            {focus.map((item) => <LabRow key={item.key} series={item} latestDay={latest.day} />)}
          </div>
        </section>
      ) : null}

      <section className="diet-section">
        <h2 className="section">Todos los valores</h2>
        {LAB_CATEGORIES.map((category) => {
          const items = series.filter((item) => item.category === category);
          if (items.length === 0) return null;
          const flagged = items.filter((item) => item.latest.flag === 'low' || item.latest.flag === 'high').length;
          return (
            <details key={category} className="diet-card lab-group">
              <summary>
                <span>{LAB_CATEGORY_LABELS[category]}</span>
                <span className="note">{items.length}{flagged ? ` · ${flagged} fuera de rango` : ''}</span>
              </summary>
              {items.map((item) => <LabRow key={item.key} series={item} latestDay={latest.day} />)}
            </details>
          );
        })}
      </section>

      <section className="diet-section">
        <h2 className="section">Estudios</h2>
        <div className="diet-card">
          {reports.map((report) => (
            <div className="meal-row lab-report" key={report.id}>
              <div>
                <p className="meal-name">{longDay(report.day)}</p>
                <p className="meal-sub">{report.lab ? `${report.lab} · ` : ''}{report.results.length} valores</p>
              </div>
              <button type="button" className="meal-remove" onClick={() => askRemove(report)}>Borrar</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function LabRow({ series, latestDay }: { series: LabSeries; latestDay: string }) {
  const { latest } = series;
  const numeric = series.points.filter((point) => point.value !== null);
  const previous = numeric.length >= 2 && latest.value !== null ? numeric[numeric.length - 2] : null;
  const delta = previous && latest.value !== null && previous.value !== null ? latest.value - previous.value : null;
  const reference = series.refText ?? rangeText(series.refLow, series.refHigh);
  return (
    <div className="lab-row">
      <div className="lab-head">
        <div className="lab-name">
          <p className="meal-name">{series.name}</p>
          <p className="meal-sub">
            {reference ? `Referencia ${reference}` : 'Sin rango de referencia'}
            {latest.day !== latestDay ? ` · último: ${longDay(latest.day)}` : ''}
          </p>
        </div>
        <div className="lab-value">
          <p>
            <strong>{latest.value !== null ? amount(latest.value) : latest.valueText}</strong>
            {series.unit ? <small> {series.unit}</small> : null}
          </p>
          {latest.flag !== 'unknown' ? <span className={`lab-pill flag-${latest.flag}`}>{LAB_FLAG_LABELS[latest.flag]}</span> : null}
        </div>
      </div>
      {numeric.length >= 2 ? <Sparkline series={series} /> : null}
      {delta !== null && previous ? (
        <p className="meal-sub">{delta === 0 ? 'Igual' : `${delta > 0 ? '+' : '−'}${amount(Math.abs(delta))}`} desde {longDay(previous.day)}</p>
      ) : null}
    </div>
  );
}

function rangeText(low: number | null, high: number | null): string | null {
  if (low !== null && high !== null) return `${amount(low)} – ${amount(high)}`;
  if (low !== null) return `> ${amount(low)}`;
  if (high !== null) return `< ${amount(high)}`;
  return null;
}

const SPARK_W = 300;
const SPARK_H = 64;
const PAD_X = 8;
const PAD_Y = 8;

/** Evolución de un valor: línea fina, banda del rango de referencia y un punto por estudio. */
function Sparkline({ series }: { series: LabSeries }) {
  const points = series.points.filter((point) => point.value !== null) as (LabSeries['points'][number] & { value: number })[];
  const values = points.map((point) => point.value);
  const bounds = [...values, series.refLow, series.refHigh].filter((value): value is number => value !== null);
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const y = (value: number) => PAD_Y + (1 - (value - min) / (max - min)) * (SPARK_H - PAD_Y * 2);
  const x = (index: number) => PAD_X + (index / (points.length - 1)) * (SPARK_W - PAD_X * 2);
  const bandTop = y(series.refHigh ?? max);
  const bandBottom = y(series.refLow ?? min);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const label = points.map((point) => `${shortDay(point.day)}: ${amount(point.value)}`).join(', ');
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`${series.name}: ${label}`}>
        {series.refLow !== null || series.refHigh !== null ? (
          <rect className="spark-band" x={0} y={bandTop} width={SPARK_W} height={Math.max(bandBottom - bandTop, 0)} />
        ) : null}
        <path className="spark-line" d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((point, index) => (
        <span
          key={point.reportId}
          className={`spark-dot flag-${point.flag}`}
          style={{ left: `${(x(index) / SPARK_W) * 100}%`, top: `${(y(point.value) / SPARK_H) * 100}%` }}
          title={`${longDay(point.day)}: ${amount(point.value)}${series.unit ? ` ${series.unit}` : ''} · ${LAB_FLAG_LABELS[point.flag]}`}
        />
      ))}
      <div className="spark-axis" aria-hidden="true">
        <span>{shortDay(points[0].day)}</span>
        <span>{shortDay(points[points.length - 1].day)}</span>
      </div>
    </div>
  );
}
