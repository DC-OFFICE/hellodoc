const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${API_BASE}/csrf`, { credentials: 'include' });
  if (!res.ok) throw new Error('Unable to initialize secure session');
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

export function clearCsrfCache() {
  csrfToken = null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await ensureCsrf();
    headers.set('x-csrf-token', token);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    credentials: 'include',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 403 && String(payload?.message ?? '').toLowerCase().includes('csrf')) {
      clearCsrfCache();
    }
    const rawMessage = payload?.message ?? payload?.error;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : rawMessage && typeof rawMessage === 'object' && 'message' in rawMessage
          ? String((rawMessage as { message: unknown }).message)
          : 'Request failed';
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

export async function openProtectedDocument(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'Unable to open document');
  const html = await res.text();
  const popup = window.open('', '_blank', 'noopener');
  if (!popup) throw new Error('Allow pop-ups to print');
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
