import { useRestTimer } from '@/rest/RestTimer';

export function RestBanner() {
  const { activeTimer, remainingSeconds, extendRest, skipRest } = useRestTimer();
  if (!activeTimer) return null;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return (
    <div className="rest-banner" aria-live="polite">
      <div>
        <p className="resume-kicker">DESCANSO</p>
        <p className="rest-time">{minutes}:{String(seconds).padStart(2, '0')}</p>
      </div>
      <button type="button" onClick={() => void extendRest()} aria-label="Extender descanso 30 segundos">+30 s</button>
      <button type="button" onClick={() => void skipRest()} aria-label="Omitir descanso">Omitir</button>
    </div>
  );
}
