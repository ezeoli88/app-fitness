import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { gym } from '@/api/client';
import { HistoryList } from '@/components/HistoryList';
import { SessionDetailView } from '@/components/SessionDetailView';
import { usePageTitle } from '@/ui/pageTitle';
import { useWide } from '@/ui/layout';

const PAGE_SIZE = 20;

export const Route = createFileRoute('/history')({
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const wide = useWide();
  usePageTitle('Historial');
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const active = useQuery({ queryKey: ['active-routine'], queryFn: () => gym.getActiveRoutine() });
  const routines = useQuery({ queryKey: ['routine-history'], queryFn: () => gym.listRoutineHistory() });
  const filterReady = picked !== undefined || active.isSuccess;
  const filter = picked !== undefined ? picked : (active.data?.id ?? null);
  const history = useInfiniteQuery({
    queryKey: ['history', filter],
    enabled: filterReady,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => gym.listCompleted(PAGE_SIZE, pageParam, filter),
    getNextPageParam: (lastPage, allPages) => lastPage.length < PAGE_SIZE ? undefined : allPages.reduce((total, page) => total + page.length, 0),
  });
  const sessions = history.data?.pages.flat() ?? [];

  const changeFilter = (id: string | null) => {
    if (id === filter && picked !== undefined) return;
    setPicked(id);
    setSelectedId(null);
  };

  return (
    <main className="page can-wide">
      <div className={wide ? 'history-split wide' : 'history-split'}>
        <div className="history-master">
          <button type="button" className="back" onClick={() => router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' })}>← Inicio</button>
          <h1 className="hero">Sesiones</h1>
          <p className="lead">Entrenamientos completos y parciales.</p>
          <div className="filters">
            <FilterChip title="Todas" selected={filterReady && filter === null} onPress={() => changeFilter(null)} />
            {(routines.data ?? []).map((routine) => (
              <FilterChip
                key={routine.id}
                title={`${routine.title}${routine.archivedAt ? ' · archivada' : ''}`}
                selected={filter === routine.id}
                onPress={() => changeFilter(routine.id)}
              />
            ))}
          </div>
          {history.isError ? <p className="error" role="alert">{history.error instanceof Error ? history.error.message : 'No se pudo cargar el historial.'}</p> : null}
          <HistoryList
            sessions={sessions}
            emptyLabel={history.isPending ? 'Cargando…' : 'Todavía no hay sesiones guardadas'}
            onPressSession={(session) => {
              if (wide) setSelectedId(session.id);
              else void navigate({ to: '/session-detail/$sessionId', params: { sessionId: String(session.id) } });
            }}
          />
          {history.hasNextPage ? (
            <button type="button" className="more" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              {history.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </div>
        {wide ? (
          <div className="history-detail">
            {selectedId ? <SessionDetailView sessionId={selectedId} embedded /> : <p className="lead">Elegí una sesión para ver el detalle.</p>}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function FilterChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return (
    <button type="button" className={selected ? 'chip on' : 'chip'} aria-pressed={selected} onClick={onPress}>{title}</button>
  );
}
