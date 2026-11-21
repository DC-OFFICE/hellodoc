const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';
const CSRF_COOKIE = 'hd_csrf';

let csrfToken: string | null = null;
let csrfInflight: Promise<string> | null = null;

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i] ?? '';
    if (!part.startsWith(`${CSRF_COOKIE}=`)) continue;
    const value = decodeURIComponent(part.slice(CSRF_COOKIE.length + 1));
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  }
  return null;
}

async function ensureCsrf(force = false): Promise<string> {
  if (!force) {
    const fromCookie = readCsrfCookie();
    if (fromCookie) {
      csrfToken = fromCookie;
      return fromCookie;
    }
    if (csrfToken) return csrfToken;
  } else {
    csrfToken = null;
  }

  if (!csrfInflight) {
    csrfInflight = (async () => {
      const res = await fetch(`${API_BASE}/csrf`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to initialize secure session');
      const data = (await res.json()) as { csrfToken: string };
      csrfToken = readCsrfCookie() ?? data.csrfToken;
      return csrfToken;
    })().finally(() => {
      csrfInflight = null;
    });
  }
  return csrfInflight;
}

export function clearCsrfCache() {
  csrfToken = null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
  attempt = 0,
): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await ensureCsrf(attempt > 0);
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
    const rawMessage = payload?.message ?? payload?.error;
    const csrfRejected =
      res.status === 403 &&
      String(Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage ?? '')
        .toLowerCase()
        .includes('csrf');
    if (csrfRejected && attempt === 0) {
      clearCsrfCache();
      return api<T>(path, options, 1);
    }
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : rawMessage && typeof rawMessage === 'object' && 'message' in rawMessage
          ? String((rawMessage as { message: unknown }).message)
          : 'Request failed';
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    throw new ApiError(res.status, message, code);
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
