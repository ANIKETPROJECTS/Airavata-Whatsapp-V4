// API client — all calls go to the API server at /api (routed by Replit's path-based proxy)
const BASE = "/api";

const TOKEN_KEY = "auth_token";

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export const masterTokenStorage = {
  get: (): string | null => localStorage.getItem('master_admin_token'),
  set: (token: string): void => localStorage.setItem('master_admin_token', token),
  clear: (): void => localStorage.removeItem('master_admin_token'),
};

type FetchOptions = RequestInit & { json?: unknown };

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { json, ...rest } = options;
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };
  let body: BodyInit | undefined = rest.body;

  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  // Send JWT from localStorage as Bearer token
  const token = tokenStorage.get();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include", // keep for cookie fallback
    ...rest,
    headers,
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      meta?: { code?: number; subcode?: number; type?: string; fbtrace_id?: string };
    };
    // Log the full server/Meta error to the browser console for debugging
    console.error(`[API] ${options.method ?? 'GET'} ${path} → ${res.status}`, data);
    const metaDetail = data.meta
      ? ` [Meta code ${data.meta.code ?? '?'}${data.meta.subcode ? `, subcode ${data.meta.subcode}` : ''}${data.meta.fbtrace_id ? `, trace ${data.meta.fbtrace_id}` : ''}]`
      : '';
    throw new Error((data.error ?? `HTTP ${res.status}`) + metaDetail);
  }

  return res.json() as Promise<T>;
}

async function masterRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { json, ...rest } = options;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    rest.body = JSON.stringify(json);
  }
  const token = masterTokenStorage.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...rest, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: "GET" }),

  post: <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: "POST", json: body }),

  put: <T>(path: string, body?: unknown, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: "PUT", json: body }),

  delete: <T>(path: string, opts?: RequestInit) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

export const masterApi = {
  get: <T>(path: string, opts?: RequestInit) => masterRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestInit) => masterRequest<T>(path, { ...opts, method: "POST", json: body }),
  put: <T>(path: string, body?: unknown, opts?: RequestInit) => masterRequest<T>(path, { ...opts, method: "PUT", json: body }),
  delete: <T>(path: string, opts?: RequestInit) => masterRequest<T>(path, { ...opts, method: "DELETE" }),
};
