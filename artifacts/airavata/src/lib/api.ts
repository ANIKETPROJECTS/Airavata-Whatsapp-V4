// API client — all calls go to the API server at /api (routed by Replit's path-based proxy)
const BASE = "/api";

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

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include", // send httpOnly cookie
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
