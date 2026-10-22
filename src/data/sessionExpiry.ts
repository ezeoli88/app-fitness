let pendingWrites = 0;
let expired = false;
const listeners = new Set<() => void>();

export function noteWriteStarted(): void {
  pendingWrites += 1;
}

export function noteWriteFinished(): void {
  pendingWrites = Math.max(0, pendingWrites - 1);
}

export function pendingWriteCount(): number {
  return pendingWrites;
}

export function notifySessionExpired(): void {
  expired = true;
  for (const listener of listeners) listener();
}

export function isSessionExpired(): boolean {
  return expired;
}

export function subscribeSessionNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reloadForAccess(): void {
  if (typeof window !== 'undefined') window.location.reload();
}

export function resetSessionNoticeForTests(): void {
  pendingWrites = 0;
  expired = false;
  listeners.clear();
}
