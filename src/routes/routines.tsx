import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';

import { gym } from '@/api/client';
import type { Routine } from '@/domain/routine';
import { refreshTraining } from '@/query';
import { confirm } from '@/ui/confirm';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/routines')({
  component: RoutinesPage,
});

function RoutinesPage() {
  const navigate = useNavigate();
  const router = useRouter();
  usePageTitle('Rutinas');
  const routines = useQuery({ queryKey: ['routines'], queryFn: () => gym.listRoutines(true) });
  const active = useQuery({ queryKey: ['active-routine'], queryFn: () => gym.getActiveRoutine() });
  const activate = useMutation({
    mutationFn: (id: string) => gym.setActiveRoutine(id),
    onSuccess: () => refreshTraining(),
    onError: (error: unknown) => confirm({
      title: 'No se pudo cambiar la rutina',
      message: error instanceof Error ? error.message : 'Probá otra vez.',
      actions: [{ text: 'Entendido' }],
    }),
  });

  const duplicate = async (routine: Routine) => {
    try {
      const id = await gym.duplicateRoutine(routine.id);
      if (!id) {
        confirm({ title: 'Rutina no disponible', message: 'Actualizá la lista y probá otra vez.', actions: [{ text: 'Entendido' }] });
        return;
      }
      await refreshTraining();
      await navigate({ to: '/routine-editor/$routineId', params: { routineId: id } });
    } catch (error) {
      confirm({
        title: 'Rutina no disponible',
        message: error instanceof Error ? error.message : 'Actualizá la lista y probá otra vez.',
        actions: [{ text: 'Entendido' }],
      });
    }
  };

  const archive = (routine: Routine) => {
    confirm({
      title: 'Archivar rutina',
      message: `«${routine.title}» seguirá apareciendo en el historial.`,
      actions: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: () => void gym.archiveRoutine(routine.id).then(() => refreshTraining()).catch((error: unknown) =>
            confirm({
              title: 'No se pudo archivar',
              message: error instanceof Error ? error.message : 'Probá otra vez.',
              actions: [{ text: 'Entendido' }],
            })
          ),
        },
      ],
    });
  };

  const available = (routines.data ?? []).filter((routine) => !routine.archivedAt);
  const archived = (routines.data ?? []).filter((routine) => Boolean(routine.archivedAt));
  const activeId = active.data?.id ?? null;

  return (
    <main className="page can-wide">
      <button type="button" className="back" onClick={() => router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' })}>← Inicio</button>
      <div className="heading">
        <div>
          <h1 className="hero">Rutinas</h1>
          <p className="lead">Elegí tu plan o armá uno propio.</p>
        </div>
        <button type="button" className="add" onClick={() => void navigate({ to: '/routine-editor/$routineId', params: { routineId: 'new' } })}>Nueva</button>
      </div>
      {routines.isError ? <p className="error" role="alert">{routines.error instanceof Error ? routines.error.message : 'No pudimos cargar las rutinas.'}</p> : null}
      <h2 className="section routine-list">Disponibles</h2>
      {available.map((routine) => {
        const selected = routine.id === activeId;
        return (
          <article key={routine.id} className={selected ? 'routine-card active' : 'routine-card'}>
            <button
              type="button"
              className="pick"
              aria-pressed={selected}
              aria-label={`${routine.level} ${routine.title}${selected ? ' Activa' : ''}`}
              onClick={() => activate.mutate(routine.id)}>
              <span className="level">{routine.level}</span>
              <span className="title-row">
                <span className="title">{routine.title}</span>
                {selected ? <span className="badge">Activa</span> : null}
              </span>
            </button>
            <div className="actions">
              <button type="button" className="action" onClick={() => void navigate({ to: '/routine-editor/$routineId', params: { routineId: routine.id } })}>Editar</button>
              <button type="button" className="action" onClick={() => void duplicate(routine)}>Duplicar</button>
              <button type="button" className="action" disabled={available.length < 2} onClick={() => archive(routine)}>Archivar</button>
            </div>
          </article>
        );
      })}
      {archived.length > 0 ? (
        <>
          <h2 className="section archived-heading">Archivadas · conservan el historial</h2>
          {archived.map((routine) => (
            <article key={routine.id} className="routine-card archived-card">
              <p className="level">{routine.level}</p>
              <div className="title-row">
                <p className="title">{routine.title}</p>
                <p className="badge">Archivada</p>
              </div>
            </article>
          ))}
        </>
      ) : null}
    </main>
  );
}
