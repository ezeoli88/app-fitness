import type { SessionSet } from '@/domain/types';

type SetRecordProps = {
  index: number;
  targetReps: number;
  result: SessionSet;
  weightText: string;
  repsText: string;
  editable: boolean;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onWeightCommit: () => void;
  onRepsCommit: () => void;
  onToggle?: () => void;
};

export function SetRecord({
  index,
  targetReps,
  result,
  weightText,
  repsText,
  editable,
  onWeightChange,
  onRepsChange,
  onWeightCommit,
  onRepsCommit,
  onToggle,
}: SetRecordProps) {
  return (
    <div className="set-row">
      {onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={result.completed}
          aria-label={`Serie ${index + 1}`}
          className={result.completed ? 'check on' : 'check'}
          onClick={onToggle}>
          {result.completed ? '✓' : index + 1}
        </button>
      ) : (
        <span className="check check-static" aria-label={`Serie ${index + 1}: ${result.completed ? 'Realizada' : 'Pendiente'}`}>
          {result.completed ? '✓' : index + 1}
        </span>
      )}
      <input
        className="set-input"
        aria-label={`Peso de la serie ${index + 1}, en kilogramos`}
        inputMode="decimal"
        disabled={!editable}
        value={weightText}
        placeholder={onToggle ? 'kg' : 'Sin dato'}
        onChange={(event) => onWeightChange(event.target.value)}
        onBlur={onWeightCommit}
      />
      <span className="set-sep">×</span>
      <input
        className="set-input"
        aria-label={`Repeticiones realizadas en la serie ${index + 1}`}
        inputMode="numeric"
        disabled={!editable}
        value={repsText}
        placeholder={onToggle ? 'reps' : 'Sin dato'}
        onChange={(event) => onRepsChange(event.target.value)}
        onBlur={onRepsCommit}
      />
      <span className="set-target" aria-label={`Objetivo: ${targetReps > 0 ? `${targetReps} repeticiones` : 'Sin dato'}`}>
        /{targetReps > 0 ? targetReps : '?'}
      </span>
    </div>
  );
}
