const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

let csrfToken: string | null = null;
let csrfInflight: Promise<string> | null = null;

async function ensureCsrf(force = false): Promise<string> {
  // Always use the API JSON body as the header token. document.cookie cannot read
  // cross-site API cookies (staging web/API on different hosts), so cookie reads
  // are not a reliable source for the double-submit header.
  if (!force && csrfToken) return csrfToken;

  if (force) {
    csrfToken = null;
    csrfInflight = null;
  }

  if (!csrfInflight) {
    csrfInflight = (async () => {
      const url = force ? `${API_BASE}/csrf?rotate=1` : `${API_BASE}/csrf`;
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to initialize secure session');
      const data = (await res.json()) as { csrfToken: string };
      if (!data.csrfToken) throw new Error('Unable to initialize secure session');
      csrfToken = data.csrfToken;
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
    if (csrfRejected) {
      throw new ApiError(
        res.status,
        'Security check failed (CSRF). Refresh the page and try again.',
        code ?? 'CSRF_INVALID',
      );
    }
    throw new ApiError(res.status, message, code);
  }

  return payload as T;
}

export async function fetchProtectedDocumentHtml(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'Unable to open document');
  return res.text();
}

export async function openProtectedDocument(
  path: string,
  options: { autoPrint?: boolean } = {},
) {
  let html = await fetchProtectedDocumentHtml(path);
  if (options.autoPrint) {
    const printScript =
      "<script>window.addEventListener('load',function(){window.focus();setTimeout(function(){window.print();},250);});</script>";
    html = html.includes('</body>')
      ? html.replace('</body>', `${printScript}</body>`)
      : `${html}${printScript}`;
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank');
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('Allow pop-ups to open the document preview, then choose Save as PDF');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
