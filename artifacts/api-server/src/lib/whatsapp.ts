/**
 * Thin wrapper around Meta's WhatsApp Cloud API (Graph API v22.0).
 * Per-user credentials are fetched from the whatsappcredentials collection and
 * decrypted at send time. The shared env-var token is retained only as a fallback.
 */

import { WhatsAppCredentialModel } from "../models/WhatsAppCredential";
import { UserModel } from "../models/User";
import { decryptToken } from "./credentialCrypto";
import { logger } from "./logger";
import { runWithTenant } from "./tenantDatabase";
import { normalizeContactPhone } from "./contactPhone";
import {
  getEcosystemWhatsAppCredentials,
  isProtectedMasterAdminUser,
} from "./protectedMasterAdmin";

const GRAPH_BASE = "https://graph.facebook.com/v22.0";
const ANALYTICS_GRAPH_BASE = "https://graph.facebook.com/v23.0";
const META_ANALYTICS_LOOKBACK_DAYS = 365;
const META_ANALYTICS_SAFE_LOOKBACK_DAYS = 270;

/** Meta Cloud API recipient format: digits only, including the country code. */
export function normalizeWhatsAppPhone(phone: string): string {
  return normalizeContactPhone(phone).slice(1);
}

/**
 * Subscribe a WABA to this app's webhook events.
 * Meta requires this per connected WABA, including tenant accounts created
 * through Embedded Signup. The call is idempotent.
 */
export async function ensureWhatsAppWebhookSubscription(
  wabaId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const raw = await response.text();
  if (!response.ok) {
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      message = parsed.error?.message ?? raw;
    } catch {
      // Keep the raw response in the error for diagnostics.
    }
    throw new Error(`Meta webhook subscription failed (${response.status}): ${message}`);
  }
}

/**
 * Repair webhook subscriptions for tenant accounts that were connected before
 * per-WABA subscription was added to Embedded Signup. Each operation is
 * isolated so one invalid or disconnected tenant does not block server start.
 */
export async function ensureTenantWebhookSubscriptions(): Promise<void> {
  const users = await UserModel.find({
    metaWabaConnected: true,
    metaWabaId: { $exists: true, $ne: null },
  })
    .select("_id metaWabaId")
    .lean();

  const results = await Promise.allSettled(
    users.map(async (user) => {
      const userId = String(user._id);
      const credential = await runWithTenant(userId, () =>
        WhatsAppCredentialModel.findOne({ userId: user._id })
          .select("wabaId accessTokenEncrypted")
          .lean(),
      );

      if (!credential) {
        throw new Error("Encrypted WhatsApp credential not found");
      }

      const accessToken = decryptToken(credential.accessTokenEncrypted);
      await ensureWhatsAppWebhookSubscription(
        String(credential.wabaId ?? user.metaWabaId),
        accessToken,
      );
      return userId;
    }),
  );

  const failed = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed.length > 0) {
    logger.warn(
      {
        tenantCount: users.length,
        repairedCount: results.length - failed.length,
        failedCount: failed.length,
        errors: failed.slice(0, 5).map((result) =>
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        ),
      },
      "Some tenant WhatsApp webhook subscriptions could not be repaired",
    );
  } else if (users.length > 0) {
    logger.info(
      { tenantCount: users.length },
      "Tenant WhatsApp webhook subscriptions confirmed",
    );
  }
}

/**
 * Ensure the ecosystem WABA is subscribed to this app's webhook events.
 * The operation is idempotent and only applies to the protected operator's
 * deployment-level WABA; ordinary tenant connections are never affected.
 */
export async function ensureEcosystemWebhookSubscription(): Promise<void> {
  const { wabaId, accessToken } = getEcosystemWhatsAppCredentials();
  await ensureWhatsAppWebhookSubscription(wabaId, accessToken);
}

/**
 * Perform a Graph API request with an explicit access token.
 * Used by all tenant-scoped WhatsApp operations.
 */
async function graphFetchWithCreds<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
  graphBase = GRAPH_BASE,
): Promise<T> {
  const url = `${graphBase}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const rawText = await res.text();
  let data: T & {
    error?: {
      message?: string;
      type?: string;
      code?: number;
      error_subcode?: number;
      fbtrace_id?: string;
    };
  };
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    throw new Error(`Meta API HTTP ${res.status} — non-JSON body: ${rawText}`);
  }

  if (!res.ok) {
    const e = data.error ?? {};
    console.error(
      "[graphFetchWithCreds] Meta error response\n" +
      `  HTTP status   : ${res.status}\n` +
      `  error.code    : ${e.code ?? "(none)"}\n` +
      `  error.type    : ${e.type ?? "(none)"}\n` +
      `  error.message : ${e.message ?? "(none)"}\n` +
      `  error_subcode : ${e.error_subcode ?? "(none)"}\n` +
      `  fbtrace_id    : ${e.fbtrace_id ?? "(none)"}\n` +
      `  full body     : ${rawText}`,
    );
    throw new Error(
      `Meta API HTTP ${res.status} | code=${e.code ?? "-"} subcode=${e.error_subcode ?? "-"} ` +
      `type=${e.type ?? "-"} fbtrace=${e.fbtrace_id ?? "-"} | ${e.message ?? rawText}`,
    );
  }
  return data;
}

/**
 * Fetch per-user WhatsApp credentials from the whatsappcredentials collection.
 * Falls back to the shared env-var token if no record is found, but always logs
 * a warning when the fallback fires — a fallback send uses Airavata's own number
 * and token, which bills the wrong account.
 */
export async function getCredentials(
  userId: string,
  options: { allowEnvFallback?: boolean } = {},
): Promise<{ phoneNumberId: string; accessToken: string; wabaId?: string }> {
  const allowEnvFallback = options.allowEnvFallback ?? true;

  // The protected operator account uses the deployment's ecosystem
  // credentials directly and never depends on Embedded Signup.
  const owner = await UserModel.findById(userId)
    .select("email isProtectedMasterAdmin")
    .lean();
  if (isProtectedMasterAdminUser(owner)) {
    const credentials = getEcosystemWhatsAppCredentials();
    logger.info(
      { userId, wabaId: credentials.wabaId, phoneNumberId: credentials.phoneNumberId },
      "[getCredentials] Using ecosystem WhatsApp credentials for protected Master Admin account",
    );
    return credentials;
  }

  try {
    const cred = await WhatsAppCredentialModel.findOne({ userId }).lean();
    if (cred) {
      const accessToken = decryptToken(cred.accessTokenEncrypted);
      return { phoneNumberId: cred.phoneNumberId, accessToken, wabaId: cred.wabaId };
    }
  } catch (err) {
    if (!allowEnvFallback) {
      throw new Error("Stored WhatsApp credentials could not be read");
    }
    logger.warn({ userId, err }, "[getCredentials] Failed to read/decrypt whatsappcredentials — falling back to shared env token");
  }

  if (!allowEnvFallback) {
    throw new Error("WhatsApp is not connected for this account");
  }

  // ── Env-var fallback ──────────────────────────────────────────────────────
  const phoneNumberId = process.env["META_PHONE_NUMBER_ID"];
  const accessToken = process.env["META_ACCESS_TOKEN"];
  if (!phoneNumberId || !accessToken) {
    throw new Error(
      `No WhatsApp credentials found for userId=${userId} and shared env credentials are also missing. ` +
      "Connect WhatsApp in Settings or set META_PHONE_NUMBER_ID and META_ACCESS_TOKEN.",
    );
  }
  logger.warn(
    { userId },
    "[getCredentials] No whatsappcredentials record found for user — falling back to shared env token. " +
    "This sends under Airavata's own WhatsApp number and bills the wrong account.",
  );
  return { phoneNumberId, accessToken };
}

export interface MetaMessagingAnalytics {
  sent: number;
  delivered: number;
  received: number;
  start: number;
  end: number;
  lookbackDays: number;
}

export interface MetaBillingInsights {
  sent: number;
  delivered: number;
  totalConversations: number;
  totalCharges: number;
  currency: string | null;
  chargesAvailable: boolean;
  categories: Array<{
    category: string;
    conversations: number;
    charges: number;
    currency: string | null;
  }>;
  start: number;
  end: number;
  rangeDays: number;
}

/**
 * Fetch Meta Partner Insights-style messaging and conversation billing data.
 * This is intentionally separate from the general dashboard totals because it
 * is only available to tenants explicitly marked as Meta-direct billed.
 */
export async function getMetaBillingInsights(
  userId: string,
  rangeDays: 7 | 30,
  now = Date.now(),
): Promise<MetaBillingInsights> {
  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId) {
    throw new Error("Stored WhatsApp credentials are missing a WABA ID");
  }

  const end = Math.floor(now / 1000);
  const start = Math.floor((now - rangeDays * 24 * 60 * 60 * 1000) / 1000);
  const wabaPath = encodeURIComponent(credentials.wabaId);

  const [messaging, conversations] = await Promise.all([
    graphFetchWithCreds<{
      analytics?: {
        data_points?: Array<{ sent?: number; delivered?: number }>;
      };
    }>(
      `/${wabaPath}?${new URLSearchParams({
        fields: `analytics.start(${start}).end(${end}).granularity(DAY)`,
      }).toString()}`,
      credentials.accessToken,
      {},
      ANALYTICS_GRAPH_BASE,
    ),
    graphFetchWithCreds<{
      conversation_analytics?: {
        data_points?: Array<{
          conversation?: number;
          cost?: number;
          currency?: string;
          conversation_category?: string;
        }>;
        data?: Array<{
          data_points?: Array<{
            conversation?: number;
            cost?: number;
            currency?: string;
            conversation_category?: string;
          }>;
        }>;
      };
    }>(
      `/${wabaPath}?${new URLSearchParams({
        fields: `conversation_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(CONVERSATION_CATEGORY)`,
      }).toString()}`,
      credentials.accessToken,
      {},
      ANALYTICS_GRAPH_BASE,
    ),
  ]);

  const messagingPoints = messaging.analytics?.data_points ?? [];
  const conversationAnalytics = conversations.conversation_analytics;
  const conversationPoints = conversationAnalytics?.data_points ??
    conversationAnalytics?.data?.flatMap((item) => item.data_points ?? []) ??
    [];
  const categoryMap = new Map<string, { conversations: number; charges: number; currency: string | null }>();

  for (const point of conversationPoints) {
    const category = point.conversation_category || "UNKNOWN";
    const current = categoryMap.get(category) ?? {
      conversations: 0,
      charges: 0,
      currency: point.currency ?? null,
    };
    current.conversations += point.conversation ?? 0;
    current.charges += point.cost ?? 0;
    if (!current.currency && point.currency) current.currency = point.currency;
    categoryMap.set(category, current);
  }

  const totalCharges = conversationPoints.reduce((total, point) => total + (point.cost ?? 0), 0);
  const currencies = [...new Set(conversationPoints.map((point) => point.currency).filter(Boolean))];

  return {
    sent: messagingPoints.reduce((total, point) => total + (point.sent ?? 0), 0),
    delivered: messagingPoints.reduce((total, point) => total + (point.delivered ?? 0), 0),
    totalConversations: conversationPoints.reduce((total, point) => total + (point.conversation ?? 0), 0),
    totalCharges,
    currency: currencies.length === 1 ? currencies[0]! : null,
    chargesAvailable: conversationPoints.some((point) => typeof point.cost === "number"),
    categories: [...categoryMap.entries()]
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.conversations - a.conversations),
    start,
    end,
    rangeDays,
  };
}

/**
 * Fetch Meta's authoritative messaging totals for the connected user's WABA.
 *
 * Meta's messaging analytics exposes sent, delivered, and received totals.
 * Read and failed message totals are not part of this endpoint, so those
 * remain derived from the per-message status webhooks stored in the tenant
 * database.
 */
export async function getMetaMessagingAnalytics(
  userId: string,
  now = Date.now(),
): Promise<MetaMessagingAnalytics> {
  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId) {
    throw new Error("Stored WhatsApp credentials are missing a WABA ID");
  }

  const end = Math.floor(now / 1000);
  const fetchAnalytics = async (productType?: number) => {
    const lookbackOptions = [META_ANALYTICS_LOOKBACK_DAYS, META_ANALYTICS_SAFE_LOOKBACK_DAYS];
    let lastError: unknown;

    for (const lookbackDays of lookbackOptions) {
      const start = Math.floor(
        (now - lookbackDays * 24 * 60 * 60 * 1000) / 1000,
      );
      const fields = [
        `analytics.start(${start})`,
        `.end(${end})`,
        ".granularity(DAY)",
        ...(productType === undefined ? [] : [`.product_types(${productType})`]),
      ].join("");
      const params = new URLSearchParams({ fields });

      try {
        const result = await graphFetchWithCreds<{
          analytics?: {
            data_points?: Array<{
              sent?: number;
              delivered?: number;
              received?: number;
            }>;
          };
        }>(
          `/${encodeURIComponent(credentials.wabaId)}?${params.toString()}`,
          credentials.accessToken,
          {},
          ANALYTICS_GRAPH_BASE,
        );

        const dataPoints = result.analytics?.data_points;
        if (!Array.isArray(dataPoints)) {
          throw new Error("Meta returned no messaging analytics data points");
        }
        return { dataPoints, start, lookbackDays };
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error) || !error.message.includes("subcode=2388336")) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Meta messaging analytics request failed");
  };

  const [outboundAnalytics, inboundAnalytics] = await Promise.all([
    fetchAnalytics(),
    // Meta product type 100 represents incoming messages from WhatsApp users.
    fetchAnalytics(100),
  ]);
  const outboundDataPoints = outboundAnalytics.dataPoints;
  const inboundDataPoints = inboundAnalytics.dataPoints;
  const lookbackDays = Math.min(outboundAnalytics.lookbackDays, inboundAnalytics.lookbackDays);

  return {
    sent: outboundDataPoints.reduce((total, point) => total + (point.sent ?? 0), 0),
    delivered: outboundDataPoints.reduce((total, point) => total + (point.delivered ?? 0), 0),
    received: inboundDataPoints.reduce((total, point) => total + (point.received ?? 0), 0),
    start: Math.min(outboundAnalytics.start, inboundAnalytics.start),
    end,
    lookbackDays,
  };
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

export interface CtaButtonParam {
  type: "URL" | "PHONE_NUMBER";
  text: string;
  /** URL for type=URL, E.164 phone for type=PHONE_NUMBER */
  value: string;
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
  /** Up to 3 quick-reply button labels (mutually exclusive with ctaButtons / flowButton) */
  quickReplies?: string[];
  /** Up to 2 CTA buttons: URL and/or PHONE_NUMBER (mutually exclusive with quickReplies / flowButton) */
  ctaButtons?: CtaButtonParam[];
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
export async function createMetaTemplate(params: CreateTemplateParams, userId: string) {
  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId) {
    throw new Error("Stored WhatsApp credentials are missing a WABA ID");
  }
  const { wabaId, accessToken } = credentials;

  // ── Authentication templates use a completely different payload structure ──
  // The BODY component must NOT contain `text`; Meta fills the body automatically.
  if (params.category === "AUTHENTICATION") {
    return buildAndSubmitAuthTemplate(params, wabaId, accessToken);
  }

  // ── MARKETING / UTILITY ───────────────────────────────────────────────────
  if (!params.body) throw new Error("body is required for MARKETING and UTILITY templates");

  type Component = {
    type: string;
    format?: string;
    text?: string;
    example?: { header_text?: string[]; header_handle?: string[] };
  };
  const components: Component[] = [];

  if (params.headerType !== "NONE") {
    const headerComp: Component = {
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
    if (params.headerType !== "TEXT" && params.headerContent) {
      headerComp.example = { header_handle: [params.headerContent] };
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

  // ── Buttons — only one mode can be active (flow / quick-reply / cta) ─────────
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
  } else if (params.quickReplies && params.quickReplies.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: params.quickReplies.slice(0, 3).map((text) => ({
        type: "QUICK_REPLY",
        text: text.slice(0, 25),
      })),
    } as unknown as Component);
  } else if (params.ctaButtons && params.ctaButtons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: params.ctaButtons.slice(0, 2).map((btn) =>
        btn.type === "URL"
          ? { type: "URL", text: btn.text.slice(0, 25), url: btn.value }
          : { type: "PHONE_NUMBER", text: btn.text.slice(0, 25), phone_number: btn.value },
      ),
    } as unknown as Component);
  }

  const payload = {
    name: params.name,
    category: params.category,
    language: params.language,
    components,
  };

  const endpoint = `${GRAPH_BASE}/${wabaId}/message_templates`;
  console.info(
    "[template] PRE-REQUEST\n" +
    `  URL   : ${endpoint}\n` +
    `  WABA  : ${wabaId}\n` +
    `  Body  : ${JSON.stringify(payload)}`,
  );

  const result = await graphFetchWithCreds<{ id: string; status: string }>(
    `/${wabaId}/message_templates`,
    accessToken,
    { method: "POST", body: JSON.stringify(payload) },
  );

  console.info("[template] Meta response:", JSON.stringify(result));
  return result;
}

/** Build and submit an Authentication (OTP) template to Meta. */
async function buildAndSubmitAuthTemplate(
  params: CreateTemplateParams,
  wabaId: string,
  accessToken: string,
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

  const endpoint = `${GRAPH_BASE}/${wabaId}/message_templates`;
  console.info(
    "[template/auth] PRE-REQUEST\n" +
    `  URL   : ${endpoint}\n` +
    `  WABA  : ${wabaId}\n` +
    `  Body  : ${JSON.stringify(payload)}`,
  );

  const result = await graphFetchWithCreds<{ id: string; status: string }>(
    `/${wabaId}/message_templates`,
    accessToken,
    { method: "POST", body: JSON.stringify(payload) },
  );

  console.info("[template/auth] Meta response:", JSON.stringify(result));
  return result;
}

/** Fetch all templates from Meta for this WABA. */
export async function getMetaTemplates(userId: string): Promise<MetaTemplateRecord[]> {
  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId) {
    throw new Error("Stored WhatsApp credentials are missing a WABA ID");
  }
  const result = await graphFetchWithCreds<{ data: MetaTemplateRecord[] }>(
    `/${credentials.wabaId}/message_templates?fields=id,name,status,category,language`,
    credentials.accessToken,
  );
  return result.data ?? [];
}

/** Delete a template from Meta by name (affects all languages). */
export async function deleteMetaTemplate(name: string, userId: string): Promise<void> {
  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId) {
    throw new Error("Stored WhatsApp credentials are missing a WABA ID");
  }
  await graphFetchWithCreds(
    `/${credentials.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    credentials.accessToken,
    { method: "DELETE" },
  );
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
  userId: string,
): Promise<string> {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  const fileBytes = new Uint8Array(fileBuffer.byteLength);
  fileBytes.set(fileBuffer);
  form.append(
    "file",
    new Blob([fileBytes.buffer], { type: mimeType }),
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

/**
 * Upload a media sample for a message template and return Meta's header handle.
 * Template examples use the resumable upload handle, which is different from
 * the media ID returned by the regular message-media endpoint.
 */
export async function uploadTemplateHeaderMedia(
  fileBuffer: Buffer,
  mimeType: string,
  userId: string,
): Promise<string> {
  const { accessToken } = await getCredentials(userId, { allowEnvFallback: false });
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    throw new Error("Meta app ID is not configured for template media uploads");
  }

  const startResponse = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(appId)}/uploads?file_length=${fileBuffer.byteLength}&file_type=${encodeURIComponent(mimeType)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const startData = (await startResponse.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!startResponse.ok || !startData.id) {
    throw new Error(`Template media session failed: ${startData.error?.message ?? JSON.stringify(startData)}`);
  }

  const bytes = new Uint8Array(fileBuffer.byteLength);
  bytes.set(fileBuffer);
  const uploadResponse = await fetch(`${GRAPH_BASE}/${startData.id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "file_offset": "0",
      "Content-Type": mimeType,
    },
    body: bytes,
  });
  const uploadData = (await uploadResponse.json()) as {
    h?: string;
    error?: { message?: string };
  };
  if (!uploadResponse.ok || !uploadData.h) {
    throw new Error(`Template media upload failed: ${uploadData.error?.message ?? JSON.stringify(uploadData)}`);
  }
  return uploadData.h;
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
  filename: string | undefined,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const mediaPayload =
    type === "document"
      ? { id: mediaId, filename: filename ?? "file" }
      : { id: mediaId };

  const result = await graphFetchWithCreds<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(to),
        type,
        [type]: mediaPayload,
      }),
    },
  );
  return result;
}

/** Send a free-text message within the 24-hour customer-service window. */
export async function sendTextMessage(to: string, body: string, userId: string) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const result = await graphFetchWithCreds<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(to),
        type: "text",
        text: { body },
      }),
    },
  );
  return result;
}

/** Send an interactive reply-button message (up to 3 buttons). */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  footer: string | undefined,
  buttons: Array<{ id: string; title: string }>,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  return graphFetchWithCreds<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppPhone(to),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    }),
  });
}

/** Send an interactive list-picker message. */
export async function sendInteractiveList(
  to: string,
  header: string | undefined,
  body: string,
  footer: string | undefined,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  return graphFetchWithCreds<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppPhone(to),
      type: "interactive",
      interactive: {
        type: "list",
        ...(header ? { header: { type: "text", text: header } } : {}),
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          button: buttonText.slice(0, 20),
          sections: sections.map((s) => ({
            title: s.title.slice(0, 24),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    }),
  });
}

/** Request the user's live location (interactive). */
export async function sendLocationRequest(to: string, body: string, userId: string) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  return graphFetchWithCreds<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppPhone(to),
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: body },
        action: { name: "send_location" },
      },
    }),
  });
}

/** Send a static location pin to the user. */
export async function sendLocationMessage(
  to: string,
  latitude: string,
  longitude: string,
  name: string | undefined,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  return graphFetchWithCreds<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppPhone(to),
      type: "location",
      location: { latitude, longitude, ...(name ? { name } : {}) },
    }),
  });
}

/** Send a media message using a public URL (no prior upload needed). */
export async function sendMediaByUrl(
  to: string,
  type: "image" | "video" | "audio" | "document",
  url: string,
  caption: string | undefined,
  filename: string | undefined,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const mediaPayload =
    type === "document"
      ? { link: url, ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) }
      : { link: url, ...(caption ? { caption } : {}) };

  return graphFetchWithCreds<{ messages: Array<{ id: string }> }>(`/${phoneNumberId}/messages`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\s+/g, ""),
      type,
      [type]: mediaPayload,
    }),
  });
}

/** Send a template message to a phone number (E.164 format, e.g. +919876543210). */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components: Array<{
    type: string;
    sub_type?: string;
    index?: string;
    parameters: Array<{ type: string; text?: string; action?: Record<string, unknown> }>;
  }> | undefined,
  userId: string,
) {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const result = await graphFetchWithCreds<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(to),
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

function sanitizeFlowScreenId(id: string): string {
  const digitWords = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
  return id.replace(/\d/g, (digit) => digitWords[Number(digit)] ?? digit);
}

export type CampaignFlow = {
  _id: unknown;
  name: string;
  metaFlowId?: string | null;
  screens?: Array<{ id: string }>;
};

/**
 * Send a WhatsApp Flow through the same strict tenant credential path used by
 * campaign template sends. The token carries campaign context so inbound
 * submissions can be attributed back to the originating campaign.
 */
export async function sendWhatsAppFlowMessage(
  to: string,
  flow: CampaignFlow,
  userId: string,
  context: { campaignId: string; recipientId: string },
) {
  if (!flow.metaFlowId) throw new Error("Flow has not been published to Meta");

  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const flowToken = [
    "flow",
    String(flow._id),
    "campaign",
    context.campaignId,
    "recipient",
    context.recipientId,
    Date.now(),
  ].join("_");
  const firstScreenId = sanitizeFlowScreenId(flow.screens?.[0]?.id ?? "SCREEN_A");

  const result = await graphFetchWithCreds<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppPhone(to),
        type: "interactive",
        interactive: {
          type: "flow",
          header: { type: "text", text: flow.name },
          body: { text: "Please complete the form below." },
          footer: { text: "Powered by Airavata" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: flowToken,
              flow_id: flow.metaFlowId,
              flow_cta: "Open Form",
              flow_action: "navigate",
              flow_action_payload: { screen: firstScreenId },
            },
          },
        },
      }),
    },
  );

  if (!result.messages?.[0]?.id) {
    throw new Error("Meta accepted the Flow request but did not return a message ID");
  }
  return { ...result, flowToken };
}
