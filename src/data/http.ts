import { noteWriteFinished, noteWriteStarted, notifySessionExpired } from '@/data/sessionExpiry';
import { createWriteQueue } from '@/db/core/queue';
import { DomainError } from '@/domain/errors';

const enqueue = createWriteQueue();

export function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  return (configured && configured.length > 0 ? configured : '/api').replace(/\/$/, '');
}

export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  noteWriteStarted();
  return enqueue(async () => {
    try {
      return await task();
    } finally {
      noteWriteFinished();
    }
  });
}

type SendOptions = {
  method?: string;
  body?: unknown;
  retryGet?: boolean;
};

function sessionExpired(response: Response): boolean {
  return response.type === 'opaqueredirect' || response.status === 0 || response.status === 401 || response.status === 403;
}

async function fetchOnce(base: string, path: string, options: SendOptions): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    redirect: 'manual',
    headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Las lecturas reintentan una vez ante un fallo de red. 401, 403 y redirecciones de Access no se reintentan. */
export async function apiSend(base: string, path: string, options: SendOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetchOnce(base, path, options);
  } catch (error) {
    if (method !== 'GET' || options.retryGet === false) throw error;
    response = await fetchOnce(base, path, options);
  }
  if (sessionExpired(response)) {
    notifySessionExpired();
    throw new Error('Tu sesión venció. Volver a entrar.');
  }
  return response;
}

export async function apiJson<T>(base: string, path: string, options: SendOptions = {}): Promise<T> {
  const response = await apiSend(base, path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { error?: string } : null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'No se pudo completar la operación.';
    if (response.status === 409 || response.status === 422) throw new DomainError(message, response.status);
    throw new Error(message);
  }
  return body as T;
}
