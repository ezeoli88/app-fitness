import { createRootRouteWithContext, HeadContent, Outlet, useNavigate, useRouterState, type ErrorComponentProps } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { ensureBootstrapped, gym, settings } from '@/api/client';
import { RestBanner } from '@/rest/RestBanner';
import { restAlerts } from '@/rest/alerts';
import { ConfirmHost } from '@/ui/ConfirmHost';
import { SessionExpiredBanner } from '@/ui/SessionExpiredBanner';
import { useWide } from '@/ui/layout';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: () => ensureBootstrapped(),
  component: Shell,
  errorComponent: BootError,
  notFoundComponent: NotFound,
});

function BootError({ error, reset }: ErrorComponentProps) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="recovery">
      <h1>No pudimos iniciar Rutina</h1>
      <p>Podés volver a intentar. Lo que ya guardaste sigue en el servidor.</p>
      <button type="button" onClick={() => reset()}>Reintentar</button>
    </main>
  );
}

function NotFound() {
  return (
    <main className="recovery">
      <h1>No encontramos esa pantalla</h1>
      <p>El enlace no corresponde a una parte de Rutina.</p>
      <a href="/">Volver al inicio</a>
    </main>
  );
}

function RestNavigation() {
  const navigate = useNavigate();
  const lastHandled = useRef<string | null>(null);
  useEffect(() => restAlerts.onOpen((data) => {
    if (lastHandled.current === data.id) return;
    lastHandled.current = data.id;
    void (async () => {
      try {
        const previous = await settings.get('lastConsumedRestNotification');
        if (previous === data.id) return;
        const details = await gym.getSessionDetails(data.sessionId);
        if (!details) return;
        if (details.status === 'open') await navigate({ to: '/session/$dayId', params: { dayId: String(details.dayId) } });
        else await navigate({ to: '/session-detail/$sessionId', params: { sessionId: String(details.id) } });
        await settings.set('lastConsumedRestNotification', data.id);
      } catch {
        lastHandled.current = null;
      }
    })();
  }), [navigate]);
  return null;
}

function Shell() {
  const wide = useWide();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onSession = /^\/session\/[^/]+$/.test(pathname);
  return (
    <>
      <HeadContent />
      <RestNavigation />
      <Outlet />
      {wide && onSession ? null : <RestBanner />}
      <ConfirmHost />
      <SessionExpiredBanner />
    </>
  );
}
