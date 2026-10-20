import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const GRAPH_VERSION = () => process.env.GRAPH_API_VERSION || "v23.0";
const GRAPH_ROOT = "https://graph.facebook.com";
const cleanMessage = (value: string) => value.replace(/(access_token|token|pin|app_secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 500);

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    readonly fbtraceId: string | undefined,
    readonly status: number,
  ) { super(message); this.name = "MetaGraphError"; }
}

export type GraphMethod = "GET" | "POST";
export type GraphBody = Record<string, string>;
export type GraphRequest = <T>(method: GraphMethod, path: string, token: string, body?: GraphBody) => Promise<T>;

export const graphRequest: GraphRequest = async <T>(method: GraphMethod, path: string, token: string, body?: GraphBody): Promise<T> => {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${GRAPH_ROOT}/${GRAPH_VERSION()}/${path.replace(/^\/+/, "")}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
      if (response.ok && !data.error) return data as T;
      const meta = data.error ?? {};
      const error = new MetaGraphError(
        cleanMessage(String(meta.message ?? `Meta request failed (${response.status})`)),
        typeof meta.code === "number" ? meta.code : undefined,
        typeof meta.error_subcode === "number" ? meta.error_subcode : undefined,
        typeof meta.fbtrace_id === "string" ? meta.fbtrace_id : undefined,
        response.status,
      );
      if (response.status < 500 || attempt === 2) throw error;
      last = error;
    } catch (error) {
      if (error instanceof MetaGraphError) throw error;
      last = error;
      if (attempt === 2) {
        throw new MetaGraphError("Network error communicating with Meta", undefined, undefined, undefined, 0);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw last;
};

function pinKey(): Buffer {
  const configured = process.env.WA_PIN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("WA_PIN_ENCRYPTION_KEY is not configured");
  if (/^[0-9a-fA-F]{64}$/.test(configured)) return Buffer.from(configured, "hex");
  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) throw new Error("WA_PIN_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)");
  return decoded;
}

export function encryptOnboardingPin(pin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptOnboardingPin(blob: string): string {
  const bytes = Buffer.from(blob, "base64");
  if (bytes.length < 29) throw new Error("Stored WhatsApp onboarding PIN is invalid");
  const decipher = createDecipheriv("aes-256-gcm", pinKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

export function sanitizeMetaMessage(value: string): string {
  return cleanMessage(value);
}

export function mapOnboardingFailure(error: unknown): { state: "action_required" | "failed"; code?: number; subcode?: number; message: string; retryAt?: Date } {
  const meta = error instanceof MetaGraphError ? error : undefined;
  const code = meta?.code;
  const subcode = meta?.subcode;
  const text = cleanMessage(error instanceof Error ? error.message : "WhatsApp setup failed");
  if (code === 133005) return { state: "action_required", code, subcode, message: "Two-step PIN mismatch. Reset the PIN in WhatsApp Manager > Phone numbers, then retry." };
  if (code === 133016) return { state: "action_required", code, subcode, message: "Too many registration attempts. Retry after 72 hours.", retryAt: new Date(Date.now() + 72 * 60 * 60 * 1000) };
  if (code === 190 || code === 102) return { state: "action_required", code, subcode, message: "Reconnect Facebook to refresh the WhatsApp connection." };
  if ([100, 200, 10].includes(code ?? -1) || (meta && meta.status >= 400 && meta.status < 500)) return { state: "action_required", code, subcode, message: text };
  return { state: "failed", code, subcode, message: meta ? text : "Temporary WhatsApp setup error. The system will retry." };
}
