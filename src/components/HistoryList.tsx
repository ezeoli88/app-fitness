import type { CompletedSession } from '@/domain/types';
import { formatHistoryDate } from '@/format';

type HistoryListProps = {
  sessions: CompletedSession[];
  emptyLabel?: string;
  onPressSession?: (session: CompletedSession) => void;
};

export function HistoryList({ sessions, emptyLabel = 'Todavía no hay sesiones', onPressSession }: HistoryListProps) {
  if (sessions.length === 0) return <p className="empty">{emptyLabel}</p>;
  return (
    <div>
      {sessions.map((session) => {
        const done = Object.values(session.completedSets).flat().filter(Boolean).length;
        const total = Object.values(session.completedSets).flat().length;
        const date = session.completedAt ? formatHistoryDate(session.completedAt) : '';
        return (
          <button
            key={session.id}
            type="button"
            className="history-row"
            disabled={!onPressSession}
            aria-label={`${session.dayTitle}, ${date}`}
            onClick={() => onPressSession?.(session)}>
            <span>
              <span className="history-title" style={{ display: 'block' }}>{session.dayTitle}</span>
              <span className="history-meta" style={{ display: 'block' }}>
                {session.routineTitle} · {session.status === 'partial' ? 'Parcial' : 'Completa'} · {done}/{total} series
              </span>
            </span>
            <span className="history-date">{date}</span>
          </button>
        );
      })}
    </div>
  );
}
