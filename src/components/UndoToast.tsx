type UndoToastProps = {
  visible: boolean;
  message?: string;
  onUndo: () => void;
};

export function UndoToast({ visible, message = 'Entrenamiento guardado', onUndo }: UndoToastProps) {
  if (!visible) return null;
  return (
    <div className="toast" aria-live="polite">
      <p>{message}</p>
      <button type="button" onClick={onUndo}>Deshacer</button>
    </div>
  );
}
