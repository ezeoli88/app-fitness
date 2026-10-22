import { useEffect, useState } from 'react';

import { isSessionExpired, pendingWriteCount, reloadForAccess, subscribeSessionNotice } from '@/data/sessionExpiry';

export function SessionExpiredBanner() {
  const [visible, setVisible] = useState(isSessionExpired());
  const [pending, setPending] = useState(pendingWriteCount());

  useEffect(() => subscribeSessionNotice(() => {
    setVisible(isSessionExpired());
    setPending(pendingWriteCount());
  }), []);

  if (!visible) return null;
  return (
    <button type="button" className="banner-expired" onClick={reloadForAccess}>
      Tu sesión venció. Volver a entrar
      {pending > 0 ? '. Hay cambios que todavía no se guardaron.' : '.'}
    </button>
  );
}
