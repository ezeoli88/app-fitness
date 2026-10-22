import { formatCompletedLong } from '@/format';

type DayCardProps = {
  dayNumber: number;
  title: string;
  totalExercises: number;
  totalSetsCount: number;
  doneExercises: number;
  doneSets: number;
  isOpen: boolean;
  isLast: boolean;
  isNext?: boolean;
  lastCompletedAt: string | null;
  onPress: () => void;
};

export function DayCard({
  dayNumber,
  title,
  totalExercises,
  totalSetsCount,
  doneExercises,
  doneSets,
  isOpen,
  isLast,
  isNext = false,
  lastCompletedAt,
  onPress,
}: DayCardProps) {
  const progress = totalSetsCount === 0 ? 0 : doneSets / totalSetsCount;
  let subtitle = `${totalExercises} ejercicios · ${totalSetsCount} series`;
  if (isOpen) subtitle = `${doneExercises} / ${totalExercises} ejercicios · ${doneSets} / ${totalSetsCount} series`;
  else if (isLast && lastCompletedAt) subtitle = `Finalizada el ${formatCompletedLong(lastCompletedAt)}`;

  return (
    <button type="button" className={isLast && !isOpen ? 'day-card last' : 'day-card'} onClick={onPress} aria-label={title}>
      <span className="day-row">
        <span>
          <span className="day-kicker">Día {dayNumber}</span>
          <span className="day-title" style={{ display: 'block' }}>{title}</span>
        </span>
        {isOpen ? <span className="badge">A medias</span> : null}
        {isLast && !isOpen ? <span className="badge-last">Última</span> : null}
        {isNext && !isOpen && !isLast ? <span className="badge-last">Próximo</span> : null}
      </span>
      {isOpen ? (
        <span className="track"><span className="fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
      ) : null}
      <span className="subtitle" style={{ display: 'block' }}>{subtitle}</span>
    </button>
  );
}
