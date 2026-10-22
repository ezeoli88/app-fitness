import type { ConfirmRequest } from '@/platform/confirmTypes';

let current: ConfirmRequest | null = null;
let listener: ((request: ConfirmRequest | null) => void) | null = null;

export function confirm(request: ConfirmRequest): void {
  current = request;
  listener?.(current);
}

export function dismissConfirm(): void {
  current = null;
  listener?.(null);
}

export function subscribeConfirm(next: (request: ConfirmRequest | null) => void): () => void {
  listener = next;
  if (current) next(current);
  return () => {
    if (listener === next) listener = null;
  };
}

export function currentConfirm(): ConfirmRequest | null {
  return current;
}
