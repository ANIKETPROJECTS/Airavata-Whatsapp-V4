/**
 * Thin wrapper around Meta's WhatsApp Cloud API (Graph API v22.0).
 * Reads credentials from environment variables so they never touch source code.
 */

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

function creds() {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!phoneNumberId || !wabaId || !accessToken) {
    throw new Error(
      "WhatsApp credentials not configured. Set META_PHONE_NUMBER_ID, META_WABA_ID, and META_ACCESS_TOKEN in Secrets.",
    );
  }
  return { phoneNumberId, wabaId, accessToken };
}

async function graphFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken } = creds();
  const url = `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  // Capture the raw text first so we can always log it verbatim
  const rawText = await res.text();
  let data: T & {
    error?: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      error_user_msg?: string;
      error_user_title?: string;
      fbtrace_id?: string;
    };
  };
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    // Non-JSON body — surface it verbatim
    throw new Error(`Meta API HTTP ${res.status} — non-JSON body: ${rawText}`);
  }

  if (!res.ok) {
    const e = data.error ?? {};
    // Log every field Meta returns so it appears verbatim in PM2 logs
    console.error(
      "[graphFetch] Meta error response\n" +
      `  HTTP status   : ${res.status}\n` +
      `  error.code    : ${e.code ?? "(none)"}\n` +
      `  error.type    : ${e.type ?? "(none)"}\n` +
      `  error.message : ${e.message ?? "(none)"}\n` +
      `  error_subcode : ${e.error_subcode ?? "(none)"}\n` +
      `  fbtrace_id    : ${e.fbtrace_id ?? "(none)"}\n` +
      `  full body     : ${rawText}`,
    );
    // Throw with the complete detail — nothing is replaced or hidden
    throw new Error(
      `Meta API HTTP ${res.status} | code=${e.code ?? "-"} subcode=${e.error_subcode ?? "-"} ` +
      `type=${e.type ?? "-"} fbtrace=${e.fbtrace_id ?? "-"} | ${e.message ?? rawText}`,
    );
  }
  return data;
}

/** Extract variable indices from a template body string, e.g. "Hi {{1}}, your OTP is {{2}}" → [1, 2] */
function extractVariableIndices(text: string): number[] {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1]!, 10)))].sort((a, b) => a - b);
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type OtpType = "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";

export interface FlowButtonParams {
  /** Meta-assigned flow ID (our DB's metaFlowId) */
  flowId: string;
  /** Button label shown in WhatsApp */
  text: string;
  /** First screen to open — must match the sanitized screen ID sent to Meta */
  navigateScreen: string;
}

export interface CreateTemplateParams {
  name: string;
  category: TemplateCategory;
  language: string;
  headerType: HeaderType;
  headerContent?: string;
  /** Required for MARKETING/UTILITY; omit for AUTHENTICATION (Meta fills it in) */
  body?: string;
  footer?: string;
  /** Ordered sample values for body variables {{1}}, {{2}}, … */
  bodySamples?: string[];
  /** Sample value for a text header variable {{1}} */
  headerSample?: string;
  /** Attach a WhatsApp Flow as a CTA button */
  flowButton?: FlowButtonParams;
  // ── AUTHENTICATION-only fields ──────────────────────────────────────────────
  /** Show "For your security, never share this code." recommendation line */
  addSecurityRecommendation?: boolean;
  /** Minutes until code expires — renders a countdown footer */
  codeExpirationMinutes?: number;
  /** OTP button type: COPY_CODE (copy to clipboard), ONE_TAP (auto-fill), ZERO_TAP (auto-submit) */
  otpType?: OtpType;
}

export interface MetaTemplateRecord {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

// ── Template operations ────────────────────────────────────────────────────────

/** Submit a new template to Meta for review. */
export async function createMetaTemplate(params: CreateTemplateParams) {
  const { wabaId } = creds();

  // ── Authentication templates use a completely different payload structure ──
  // The BODY component must NOT contain `text`; Meta fills the body automatically.
  if (params.category === "AUTHENTICATION") {
    return buildAndSubmitAuthTemplate(params, wabaId);
  }

  // ── MARKETING / UTILITY ───────────────────────────────────────────────────
  if (!params.body) throw new Error("body is required for MARKETING and UTILITY templates");

  type Component = { type: string; format?: string; text?: string };
  const components: Component[] = [];

  if (params.headerType !== "NONE") {
    const headerComp: Component & { example?: { header_text: string[] } } = {
      type: "HEADER",
      format: params.headerType,
      ...(params.headerType === "TEXT" && params.headerContent ? { text: params.headerContent } : {}),
    };
    const headerHasVars =
      params.headerType === "TEXT" && params.headerContent
        ? /\{\{\d+\}\}/.test(params.headerContent)
        : false;
    if (headerHasVars && params.headerSample) {
      headerComp.example = { header_text: [params.headerSample] };
    }
    components.push(headerComp);
  }

  const varIndices = extractVariableIndices(params.body);
  const bodyComponent: Component & { example?: { body_text: string[][] } } = {
    type: "BODY",
    text: params.body,
  };
  if (varIndices.length > 0) {
    const sampleValues = varIndices.map((i, pos) =>
      params.bodySamples?.[pos]?.trim() || `sample_value_${i}`,
    );
    bodyComponent.example = { body_text: [sampleValues] };
  }
  components.push(bodyComponent);

  if (params.footer) {
    components.push({ type: "FOOTER", text: params.footer });
  }

  if (params.flowButton) {
    components.push({
      type: "BUTTONS",
      buttons: [
        {
          type: "FLOW",
          text: params.flowButton.text,
          flow_id: params.flowButton.flowId,
          navigate_screen: params.flowButton.navigateScreen,
          flow_action: "navigate",
        },
      ],
    } as unknown as Component);
  }

  const payload = {
    name: params.name,
    category: params.category,
    language: params.language,
    components,
  };

  const { accessToken } = creds();
  const endpoint = `${GRAPH_BASE}/${wabaId}/message_templates`;
  console.info(
    "[template] PRE-REQUEST\n" +
    `  URL   : ${endpoint}\n` +
    `  WABA  : ${wabaId}\n` +
    `  Token : ${accessToken.slice(0, 20)}...\n` +
    `  Body  : ${JSON.stringify(payload)}`,
  );

  const result = await graphFetch<{ id: string; status: string }>(
    `/${wabaId}/message_templates`,
    { method: "POST", body: JSON.stringify(payload) },
  );

  console.info("[template] Meta response:", JSON.stringify(result));
  return result;
}

/** Build and submit an Authentication (OTP) template to Meta. */
async function buildAndSubmitAuthTemplate(
  params: CreateTemplateParams,
  wabaId: string,
) {
  type AuthComponent =
    | { type: "BODY"; add_security_recommendation?: boolean }
    | { type: "FOOTER"; code_expiration_minutes: number }
    | { type: "BUTTONS"; buttons: Array<{ type: "OTP"; otp_type: OtpType; text: string }> };

  const components: AuthComponent[] = [];

  // BODY — set add_security_recommendation if requested (omit the key otherwise)
  const bodyComp: AuthComponent = { type: "BODY" };
  if (params.addSecurityRecommendation) {
    (bodyComp as { type: "BODY"; add_security_recommendation?: boolean }).add_security_recommendation = true;
  }
  components.push(bodyComp);

  // FOOTER — only include when expiration is set
  if (params.codeExpirationMinutes && params.codeExpirationMinutes > 0) {
    components.push({ type: "FOOTER", code_expiration_minutes: params.codeExpirationMinutes });
  }

  // BUTTONS — OTP button is required for Authentication templates
  const otpType: OtpType = params.otpType ?? "COPY_CODE";
  const otpButtonText =
    otpType === "COPY_CODE" ? "Copy Code" :
    otpType === "ONE_TAP"   ? "Autofill" :
    /* ZERO_TAP */             "Autofill";

  components.push({
    type: "BUTTONS",
    buttons: [{ type: "OTP", otp_type: otpType, text: otpButtonText }],
  });

  const payload = {
    name: params.name,
    category: "AUTHENTICATION",
    language: params.language,
    components,
  };

  const { accessToken } = creds();
  const endpoint = `${GRAPH_BASE}/${wabaId}/message_templates`;
  console.info(
    "[template/auth] PRE-REQUEST\n" +
    `  URL   : ${endpoint}\n` +
    `  WABA  : ${wabaId}\n` +
    `  Token : ${accessToken.slice(0, 20)}...\n` +
    `  Body  : ${JSON.stringify(payload)}`,
  );

  const result = await graphFetch<{ id: string; status: string }>(
    `/${wabaId}/message_templates`,
    { method: "POST", body: JSON.stringify(payload) },
  );

  console.info("[template/auth] Meta response:", JSON.stringify(result));
  return result;
}

/** Fetch all templates from Meta for this WABA. */
export async function getMetaTemplates(): Promise<MetaTemplateRecord[]> {
  const { wabaId } = creds();
  const result = await graphFetch<{ data: MetaTemplateRecord[] }>(
    `/${wabaId}/message_templates?fields=id,name,status,category,language`,
  );
  return result.data ?? [];
}

/** Delete a template from Meta by name (affects all languages). */
export async function deleteMetaTemplate(name: string): Promise<void> {
  const { wabaId } = creds();
  await graphFetch(`/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// ── Messaging ─────────────────────────────────────────────────────────────────

/**
 * Upload a media file to Meta and return the media_id.
 * Buffer is uploaded as multipart/form-data to the Cloud API media endpoint.
 */
export async function uploadMedia(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const { phoneNumberId, accessToken } = creds();

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new Blob([fileBuffer], { type: mimeType }),
    filename,
  );

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(`Media upload failed: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

/** Derive the WhatsApp message type from a MIME type. */
export function mediaTypeFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

/** Send a media message (image / document / video / audio) using an already-uploaded media_id. */
export async function sendMediaMessage(
  to: string,
  mediaId: string,
  type: "image" | "video" | "audio" | "document",
  filename?: string,
) {
  const { phoneNumberId } = creds();
  const mediaPayload =
    type === "document"
      ? { id: mediaId, filename: filename ?? "file" }
      : { id: mediaId };

  const result = await graphFetch<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\s+/g, ""),
        type,
        [type]: mediaPayload,
      }),
    },
  );
  return result;
}

/** Send a free-text message within the 24-hour customer-service window. */
export async function sendTextMessage(to: string, body: string) {
  const { phoneNumberId } = creds();
  const result = await graphFetch<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\s+/g, ""),
        type: "text",
        text: { body },
      }),
    },
  );
  return result;
}

/** Send a template message to a phone number (E.164 format, e.g. +919876543210). */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components?: Array<{ type: string; parameters: Array<{ type: string; text?: string }> }>,
) {
  const { phoneNumberId } = creds();
  const result = await graphFetch<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\s+/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components?.length ? { components } : {}),
        },
      }),
    },
  );
  return result;
}
