import { useEffect, useState } from 'react';

import { dismissConfirm, subscribeConfirm } from '@/ui/confirm';
import type { ConfirmRequest } from '@/ui/confirmTypes';

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeConfirm(setRequest), []);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const cancel = [...request.actions].reverse().find((action) => action.style === 'cancel') ?? request.actions[0];
      dismissConfirm();
      cancel?.onPress?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;

  const run = (index: number) => {
    const action = request.actions[index];
    dismissConfirm();
    action?.onPress?.();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{request.title}</h2>
        {request.message ? <p>{request.message}</p> : null}
        <div className="modal-actions">
          {request.actions.map((action, index) => (
            <button
              key={`${action.text}-${index}`}
              type="button"
              className={`confirm-action${action.style === 'cancel' ? ' cancel' : ''}${action.style === 'destructive' ? ' danger' : ''}`}
              onClick={() => run(index)}>
              {action.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
