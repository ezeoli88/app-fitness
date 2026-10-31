import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { diet } from '@/api/client';
import { healthyWaistLimit, type DietSummary } from '@/domain/diet';

const DEFAULT_WAIST_CM = 90;

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const decimal = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function WaistCard({ summary, onSaved }: { summary: DietSummary; onSaved: () => void }) {
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
