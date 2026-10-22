import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { WebAccount } from '@/components/WebAccount';
import { useRestTimer } from '@/rest/RestTimer';
import { usePageTitle } from '@/ui/pageTitle';

const PRESETS = [30, 60, 90, 120, 180, 300];

function durationLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}

export const Route = createFileRoute('/rest-settings')({
  component: RestSettingsPage,
});

function RestSettingsPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const rest = useRestTimer();
  usePageTitle('Descanso');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setDuration = async (seconds: number) => {
    try {
      await rest.setDurationSeconds(seconds);
      setCustom('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cambiar el descanso.');
    }
  };

  const saveCustom = () => {
    const seconds = Number(custom.trim());
    if (!Number.isSafeInteger(seconds) || seconds < 15 || seconds > 600) {
      setError('Elegí entre 15 segundos y 600 segundos.');
      return;
    }
    void setDuration(seconds);
  };

  return (
    <main className="page can-wide">
      <button type="button" className="back" onClick={() => router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' })}>← Inicio</button>
      <h1 className="hero">Descanso entre series</h1>
      <p className="lead">El contador se inicia al marcar una serie cuando quedan otras por completar.</p>
      <div className="toggle-card">
        <div className="toggle-copy">
          <p className="toggle-title">Temporizador automático</p>
          <p className="note">Podés extenderlo 30 segundos o saltearlo durante el entrenamiento.</p>
        </div>
        <button
          type="button"
          role="switch"
          className={rest.enabled ? 'switch on' : 'switch'}
          aria-checked={rest.enabled}
          aria-label="Activar temporizador de descanso"
          onClick={() => void rest.setEnabled(!rest.enabled)}>
          <span />
        </button>
      </div>
      <h2 className="section" style={{ marginTop: 28 }}>Duración predeterminada</h2>
      <div className="presets">
        {PRESETS.map((seconds) => {
          const selected = rest.durationSeconds === seconds;
          return (
            <button key={seconds} type="button" className={selected ? 'preset on' : 'preset'} aria-pressed={selected} onClick={() => void setDuration(seconds)}>
              {durationLabel(seconds)}
            </button>
          );
        })}
      </div>
      <p className="current">Ahora: {durationLabel(rest.durationSeconds)}</p>
      <label className="label" htmlFor="custom-rest">Otro tiempo · 15 a 600 segundos</label>
      <div className="custom-row">
        <input
          id="custom-rest"
          className="input"
          inputMode="numeric"
          value={custom}
          placeholder="Ej.: 90"
          aria-label="Duración personalizada en segundos"
          onChange={(event) => { setCustom(event.target.value.replace(/\D/g, '')); setError(null); }}
        />
        <button type="button" className="apply" onClick={saveCustom}>Aplicar</button>
      </div>
      <button type="button" className="apply enable" onClick={() => void rest.requestNotificationPermission()}>Activar avisos</button>
      {rest.permissionMessage ? (
        <div className="permission"><p>{rest.permissionMessage}</p></div>
      ) : (
        <p className="note permission-hint">El aviso suena en esta pestaña. Si la dejás en segundo plano puede atrasarse, y si cerrás el navegador no hay aviso.</p>
      )}
      <WebAccount />
      {rest.activeTimer ? (
        <button type="button" className="skip" onClick={() => void rest.skipRest()}>Omitir el descanso actual</button>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </main>
  );
}
