import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { gym } from '@/api/client';
import { DayCard } from '@/components/DayCard';
import { HistoryList } from '@/components/HistoryList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { countCompletedExercises, countCompletedSets, totalSets } from '@/domain/session';
import { nextTrainingDay } from '@/domain/routine';
import { formatTodayHeader } from '@/format';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  usePageTitle('Entrenar');
  const home = useQuery({ queryKey: ['home'], queryFn: () => gym.getHomeSnapshot() });
  const days = home.data?.days ?? [];
  const last = home.data?.lastCompleted ?? null;
  const recent = home.data?.recent ?? [];
  const openSessions = home.data?.openSessions ?? [];
  const routine = home.data?.routine ?? null;
  const nextDay = nextTrainingDay(days.map((item) => item.day), last?.dayId ?? null);
  const resumable = openSessions[0];
  const visibleOpenIds = new Set(days.filter((item) => item.open).map((item) => item.open!.id));
  const archivedDaySession = openSessions.find((item) => !visibleOpenIds.has(item.id));

  const dayCards = days.map((item, index) => {
    const doneSets = item.open ? countCompletedSets(item.open.completedSets) : 0;
    const doneExercises = item.open ? countCompletedExercises(item.exercises, item.open.completedSets) : 0;
    const isLast = last?.dayId === item.day.id && !item.open;
    return (
      <DayCard
        key={item.day.id}
        dayNumber={index + 1}
        title={item.day.title}
        totalExercises={item.exercises.length}
        totalSetsCount={totalSets(item.exercises)}
        doneExercises={doneExercises}
        doneSets={doneSets}
        isOpen={Boolean(item.open)}
        isLast={isLast}
        isNext={nextDay?.id === item.day.id}
        lastCompletedAt={isLast ? last?.completedAt ?? null : null}
        onPress={() => void navigate({ to: '/session/$dayId', params: { dayId: String(item.day.id) } })}
      />
    );
  });

  const resumeCard = resumable ? (
    <button type="button" className="resume home-resume" onClick={() => void navigate({ to: '/session/$dayId', params: { dayId: String(resumable.dayId) } })}>
      <span className="resume-copy">
        <span className="resume-kicker">CONTINUAR ENTRENAMIENTO</span>
        <span className="resume-title" style={{ display: 'block' }}>{resumable.dayTitle}</span>
        <span className="resume-sub" style={{ display: 'block' }}>{resumable.routineTitle}</span>
      </span>
      <span className="arrow">→</span>
    </button>
  ) : null;

  const archivedCard = archivedDaySession ? (
    <button type="button" className="archived-open home-archived" onClick={() => void navigate({ to: '/session/$dayId', params: { dayId: String(archivedDaySession.dayId) } })}>
      También podés continuar «{archivedDaySession.dayTitle}» de «{archivedDaySession.routineTitle}».
    </button>
  ) : null;

  const historyBlock = (
    <section className="home-history">
      <div className="history-heading">
        <h2 className="section">Sesiones</h2>
        {recent.length > 0 ? (
          <button type="button" className="history-link" onClick={() => void navigate({ to: '/history' })}>Ver historial</button>
        ) : null}
      </div>
      <HistoryList sessions={recent} onPressSession={(session) => void navigate({ to: '/session-detail/$sessionId', params: { sessionId: String(session.id) } })} />
    </section>
  );

  return (
    <main className="page can-wide">
      <div className="top">
        <div className="titles">
          <p className="kicker">{formatTodayHeader()}</p>
          <h1 className="hero">Entrenar</h1>
          <button type="button" className="routine-link" onClick={() => void navigate({ to: '/routines' })}>{routine?.title ?? 'Elegir rutina'}</button>
          <button type="button" className="rest-link" style={{ display: 'block' }} onClick={() => void navigate({ to: '/rest-settings' })}>Descanso y temporizador</button>
          <button type="button" className="rest-link" style={{ display: 'block' }} onClick={() => void navigate({ to: '/diet' })}>Dieta</button>
        </div>
        <ThemeToggle />
      </div>
      {home.isError ? <p className="error" role="alert">{home.error instanceof Error ? home.error.message : 'No pudimos cargar el inicio.'}</p> : null}
      {home.isPending ? <p className="note">Cargando…</p> : null}
      <div className="home-grid">
        <section className="home-days">{dayCards}</section>
        <div className="home-side">
          {resumeCard}
          {archivedCard}
          {historyBlock}
        </div>
      </div>
    </main>
  );
}
