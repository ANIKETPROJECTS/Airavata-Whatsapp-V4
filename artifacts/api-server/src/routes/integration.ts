/**
 * Integration routes — Facebook / WhatsApp Embedded Signup
 *
 * POST /api/whatsapp/onboard
 * Receives the short-lived auth code from the frontend Embedded Signup popup,
 * exchanges it for a WhatsApp Business access token via the Meta Graph API,
 * discovers the shared WABA and phone number, and stores them against the
 * authenticated user.
 */

import { Router, type Response } from "express";
import mongoose from "mongoose";
import { authenticate, requireMasterAdmin, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { WhatsAppCredentialModel } from "../models/WhatsAppCredential";
import { runWithTenant } from "../lib/tenantDatabase";
import { decryptToken, encryptToken } from "../lib/credentialCrypto";
import { logger } from "../lib/logger";
import {
  getEcosystemWhatsAppCredentialIds,
  isProtectedMasterAdminUser,
} from "../lib/protectedMasterAdmin";
import { ensureWhatsAppWebhookSubscription, getCredentials } from "../lib/whatsapp";

const router = Router();

const META_APP_ID = process.env.META_APP_ID ?? "1324395306544610";
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CATALOG_GRAPH_BASE = "https://graph.facebook.com/v26.0";

type MetaCatalog = {
  id: string;
  name?: string | null;
  vertical?: string | null;
};

type MetaProduct = {
  id: string;
  name?: string | null;
  description?: string | null;
  price?: string | number | null;
  currency?: string;
  image_url?: string | null;
  retailer_id?: string | null;
  availability?: string | null;
  product_type?: string | null;
};

type CatalogProductInput = {
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  retailerId: string;
  availability: "in stock" | "out of stock";
  productType?: string;
};

class CatalogRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CatalogRouteError";
  }
}

async function metaGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const raw = await response.text();
  let data: T & {
    error?: { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {} as typeof data;
  }
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message ?? `Meta Graph API request failed (${response.status})`);
    Object.assign(error, {
      status: response.status,
      meta: data.error ?? { message: raw.slice(0, 500) },
    });
    throw error;
  }
  return data;
}

async function metaPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data: T & {
    error?: { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {} as typeof data;
  }
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message ?? `Meta Graph API request failed (${response.status})`);
    Object.assign(error, {
      status: response.status,
      meta: data.error ?? { message: raw.slice(0, 500) },
    });
    throw error;
  }
  return data;
}

async function metaCatalogRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  accessToken: string,
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  const url = new URL(`${CATALOG_GRAPH_BASE}/${path}`);
  const requestOptions: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  };

  if (method === "POST") {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      body.set(key, String(value));
    }
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    requestOptions.body = body.toString();
  } else {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, requestOptions);
  const raw = await response.text();
  let data: T & {
    error?: {
      message?: string;
      code?: number;
      error_subcode?: number;
      type?: string;
      fbtrace_id?: string;
    };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = {} as typeof data;
  }
  if (!response.ok || data.error) {
    const error = new Error(
      data.error?.message ?? `Meta Graph API request failed (${response.status})`,
    );
    Object.assign(error, {
      status: response.status,
      meta: data.error ?? { message: raw.slice(0, 500) },
    });
    throw error;
  }
  return data;
}

function sendCatalogError(
  res: Response,
  error: unknown,
  userId: string,
  operation: string,
): void {
  const typedError = error as Error & {
    status?: number;
    meta?: Record<string, unknown>;
  };
  const metaMessage =
    typeof typedError.meta?.message === "string"
      ? typedError.meta.message
      : "";
  const requiresBusinessManagement =
    /requires business_management permission/i.test(metaMessage) ||
    /requires business_management permission/i.test(typedError.message ?? "");
  const status = error instanceof CatalogRouteError
    ? error.status
    : requiresBusinessManagement
      ? 403
      : 502;
  logger.error({ err: error, userId }, operation);
  res.status(status).json({
    error: requiresBusinessManagement
      ? "Meta requires business_management. Add business_management, catalog_management, and dependencies to Airavata’s Facebook Login for Business configuration. Get Advanced Access for clients, then have this client reconnect WhatsApp. If it still fails, verify their business/Page admin access."
      : typedError.message || "Catalog operation failed",
    ...(typedError.meta ? { meta: typedError.meta } : {}),
  });
}

async function requireTenantCatalogCredentials(userId: string): Promise<{
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}> {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new CatalogRouteError("A valid authenticated user is required", 401);
  }
  const owner = await UserModel.findById(userId)
    .select("isProtectedMasterAdmin")
    .lean();
  if (!owner) throw new CatalogRouteError("Account not found", 404);
  if (isProtectedMasterAdminUser(owner)) {
    throw new CatalogRouteError(
      "Catalog management is available only for a client-owned WhatsApp connection",
      409,
    );
  }

  const storedCredential = await runWithTenant(userId, () =>
    WhatsAppCredentialModel.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .select("wabaId phoneNumberId")
      .lean(),
  );
  if (!storedCredential) {
    throw new CatalogRouteError(
      "Connect a WhatsApp Business Account before managing its catalog",
      409,
    );
  }

  const credentials = await getCredentials(userId, { allowEnvFallback: false });
  if (!credentials.wabaId || !credentials.phoneNumberId) {
    throw new CatalogRouteError(
      "Connect a WhatsApp Business Account before managing its catalog",
      409,
    );
  }
  return {
    wabaId: credentials.wabaId,
    phoneNumberId: credentials.phoneNumberId,
    accessToken: credentials.accessToken,
  };
}

async function getTenantCatalogRecord(userId: string) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return runWithTenant(userId, () =>
    WhatsAppCredentialModel.findOne({ userId: userObjectId })
      .select("metaCatalogId catalogName catalogConnected catalogLastSyncedAt")
      .lean(),
  );
}

async function saveTenantCatalogSettings(
  userId: string,
  catalog: MetaCatalog,
) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return runWithTenant(userId, () =>
    WhatsAppCredentialModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        $set: {
          metaCatalogId: catalog.id,
          catalogName: catalog.name || catalog.id,
          catalogConnected: true,
          catalogLastSyncedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .select("metaCatalogId catalogName catalogConnected catalogLastSyncedAt")
      .lean(),
  );
}

function shapeCatalogSettings(credential: {
  metaCatalogId?: string | null;
  catalogName?: string | null;
  catalogConnected?: boolean;
  catalogLastSyncedAt?: Date | string | null;
} | null | undefined) {
  return {
    metaCatalogId: credential?.metaCatalogId ?? null,
    catalogName: credential?.catalogName ?? null,
    catalogConnected: credential?.catalogConnected === true,
    catalogLastSyncedAt: credential?.catalogLastSyncedAt ?? null,
  };
}

async function getOwningMetaBusiness(
  wabaId: string,
  accessToken: string,
): Promise<{ id: string; name?: string | null }> {
  const waba = await metaCatalogRequest<{
    owner_business_info?: { id?: string; name?: string | null };
  }>(
    "GET",
    encodeURIComponent(wabaId),
    accessToken,
    { fields: "owner_business_info" },
  );
  const businessId = waba.owner_business_info?.id;
  if (!businessId) {
    throw new CatalogRouteError(
      "Meta did not return the business that owns this WhatsApp account",
      409,
    );
  }
  return {
    id: businessId,
    name: waba.owner_business_info?.name ?? null,
  };
}

async function getTenantMetaCatalogContext(
  wabaId: string,
  accessToken: string,
): Promise<{
  businessId: string;
  businessName: string | null;
  pages: Array<{ id: string; name: string }>;
}> {
  const business = await getOwningMetaBusiness(wabaId, accessToken);
  const pages = await metaCatalogRequest<{
    data?: Array<{ id?: string; name?: string }>;
  }>(
    "GET",
    `${encodeURIComponent(business.id)}/owned_pages`,
    accessToken,
    { fields: "id,name", limit: 100 },
  );
  return {
    businessId: business.id,
    businessName: business.name ?? null,
    pages: (pages.data ?? [])
      .filter((page): page is { id: string; name: string } =>
        Boolean(page.id && page.name),
      )
      .map((page) => ({ id: page.id, name: page.name })),
  };
}

function normalizeMetaProduct(product: MetaProduct) {
  const rawPrice = product.price;
  const parsedPrice =
    typeof rawPrice === "number"
      ? rawPrice
      : Number.parseFloat(String(rawPrice ?? "").replace(/[^\d.-]/g, ""));
  const priceText = typeof rawPrice === "string" ? rawPrice : "";
  const currencyFromPrice = priceText.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
  return {
    id: product.id,
    name: product.name ?? "",
    description: product.description ?? "",
    price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    currency: product.currency?.toUpperCase() || currencyFromPrice || "",
    image_url: product.image_url ?? null,
    retailer_id: product.retailer_id ?? "",
    availability: product.availability ?? "pending",
    product_type: product.product_type ?? null,
  };
}

function parseCatalogProductInput(body: unknown): CatalogProductInput {
  if (!body || typeof body !== "object") {
    throw new CatalogRouteError("Product details are required", 400);
  }
  const value = body as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl.trim() : "";
  const retailerId = typeof value.retailerId === "string" ? value.retailerId.trim() : "";
  const currency =
    typeof value.currency === "string" ? value.currency.trim().toUpperCase() : "";
  const availability =
    value.availability === "in stock" || value.availability === "out of stock"
      ? value.availability
      : "";
  const price = typeof value.price === "number" ? value.price : Number(value.price);
  const productType =
    typeof value.productType === "string" ? value.productType.trim() : "";

  if (!name || name.length > 200) {
    throw new CatalogRouteError("Product name is required and must be 200 characters or fewer", 400);
  }
  if (!description || description.length > 5000) {
    throw new CatalogRouteError("Product description is required and must be 5,000 characters or fewer", 400);
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new CatalogRouteError("Product price must be greater than zero", 400);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new CatalogRouteError("Currency must be a 3-letter ISO code", 400);
  }
  if (!retailerId || retailerId.length > 100) {
    throw new CatalogRouteError("Retailer ID / SKU is required and must be 100 characters or fewer", 400);
  }
  if (!availability) {
    throw new CatalogRouteError("Availability must be in stock or out of stock", 400);
  }
  try {
    const parsedImageUrl = new URL(imageUrl);
    if (parsedImageUrl.protocol !== "https:") throw new Error();
  } catch {
    throw new CatalogRouteError("Image must be a publicly reachable HTTPS URL", 400);
  }
  if (productType.length > 200) {
    throw new CatalogRouteError("Product category must be 200 characters or fewer", 400);
  }
  return {
    name,
    description,
    price,
    currency,
    imageUrl,
    retailerId,
    availability,
    ...(productType ? { productType } : {}),
  };
}

function toMetaProductFields(input: CatalogProductInput) {
  return {
    name: input.name,
    description: input.description,
    price: `${input.price.toFixed(2)} ${input.currency}`,
    image_url: input.imageUrl,
    retailer_id: input.retailerId,
    availability: input.availability,
    ...(input.productType ? { product_type: input.productType } : {}),
  };
}

async function onboardWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  try {
    const requestedTargetUserId = typeof req.body?.targetUserId === "string"
      ? req.body.targetUserId
      : undefined;
    if (requestedTargetUserId && req.user?.kind !== "master" && requestedTargetUserId !== req.user?.userId) {
      res.status(403).json({ error: "You can only connect your own WhatsApp account" });
      return;
    }
    const ownerUserId = requestedTargetUserId ?? req.user!.userId;
    if (!mongoose.Types.ObjectId.isValid(ownerUserId)) {
      res.status(400).json({ error: "A valid target user is required" });
      return;
    }
    if (req.user?.kind === "master" && !requestedTargetUserId) {
      res.status(400).json({ error: "Master Admin connections require a target user" });
      return;
    }
    const owner = await UserModel.findById(ownerUserId).select("email isProtectedMasterAdmin").lean();
    if (!owner) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }
    if (isProtectedMasterAdminUser(owner)) {
      res.status(409).json({ error: "This protected Master Admin account uses ecosystem WhatsApp credentials and does not require Facebook connection" });
      return;
    }
    const { code } = (req.body ?? {}) as {
      code?: string;
      waba_id?: string;
      phone_number_id?: string;
    };

    if (!code) {
      res.status(400).json({
        error: "Missing auth code from Facebook SDK",
      });
      return;
    }

    if (!META_APP_SECRET) {
      res.status(503).json({
        error: "META_APP_SECRET is not configured",
      });
      return;
    }

    logger.info(
      {
        codePresent: true,
        codeLength: code.length,
        frontendWabaId: req.body?.waba_id ?? null,
        frontendPhoneNumberId: req.body?.phone_number_id ?? null,
        graphApiVersion: GRAPH_API_VERSION,
        tokenExchangePath: "/oauth/access_token",
      },
      "WhatsApp Embedded Signup: starting Meta code exchange",
    );

    const tokenUrl =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
      `?client_id=${META_APP_ID}` +
      `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl);

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      token_type?: string;
      waba_id?: string;
      phone_number_id?: string;
      error?: {
        message?: string;
      };
    };
    logger.info(
      {
        status: tokenRes.status,
        accessTokenPresent: Boolean(tokenData.access_token),
        wabaIdPresent: Boolean(tokenData.waba_id),
        phoneNumberIdPresent: Boolean(tokenData.phone_number_id),
      },
      "WhatsApp Embedded Signup: Meta token exchange response received",
    );

    if (!tokenRes.ok || !tokenData.access_token) {
      logger.error(
        {
          status: tokenRes.status,
          error: tokenData.error?.message,
          codeLength: code.length,
        },
        "Meta token exchange failed",
      );

      res.status(502).json({
        error: tokenData.error?.message ?? "Meta token exchange failed",
      });

      return;
    }

    const accessToken = tokenData.access_token;

    let wabaId = tokenData.waba_id ?? req.body?.waba_id;
    let phoneNumberId = tokenData.phone_number_id ?? req.body?.phone_number_id;

    /**
     * Try to discover WABA from debug_token.
     */
    if (!wabaId) {
      const debugTokenUrl =
        `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token` +
        `?input_token=${encodeURIComponent(accessToken)}`;

      const debugTokenRes = await fetch(debugTokenUrl, {
        headers: {
          Authorization: `Bearer ${
            process.env.META_ACCESS_TOKEN ?? accessToken
          }`,
        },
      });

      const debugTokenData = (await debugTokenRes.json()) as {
        data?: {
          granular_scopes?: Array<{
            scope?: string;
            target_ids?: string[];
          }>;
        };
        error?: {
          message?: string;
        };
      };

      wabaId = debugTokenData.data?.granular_scopes
        ?.filter(
          (scope) =>
            scope.scope === "whatsapp_business_management" ||
            scope.scope === "whatsapp_business_messaging",
        )
        .flatMap((scope) => scope.target_ids ?? [])
        .find(Boolean);

      if (!debugTokenRes.ok) {
        logger.warn(
          {
            status: debugTokenRes.status,
            error: debugTokenData.error?.message,
          },
          "Meta debug token lookup failed; trying business account fallback",
        );
      }
    }

    /**
     * Compatibility fallback for tokens that don't expose
     * granular scopes.
     */
    if (!wabaId) {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses` +
          `?fields=owned_whatsapp_business_accounts{id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const wabaData = (await wabaRes.json()) as {
        data?: Array<{
          owned_whatsapp_business_accounts?: {
            data?: Array<{
              id?: string;
            }>;
          };
        }>;
        error?: {
          message?: string;
        };
      };

      wabaId = wabaData.data
        ?.flatMap(
          (business) => business.owned_whatsapp_business_accounts?.data ?? [],
        )
        .find((account) => account.id)?.id;

      if (!wabaRes.ok) {
        logger.warn(
          {
            status: wabaRes.status,
            error: wabaData.error?.message,
          },
          "Meta business account lookup failed",
        );
      }
    }

    /**
     * Get phone number from WABA.
     */
    if (wabaId && !phoneNumberId) {
      const phoneRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
          wabaId,
        )}/phone_numbers` + `?fields=id,display_phone_number,verified_name`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const phoneData = (await phoneRes.json()) as {
        data?: Array<{
          id?: string;
          display_phone_number?: string;
          verified_name?: string;
        }>;
        error?: {
          message?: string;
        };
      };

      phoneNumberId = phoneData.data?.find((phone) => phone.id)?.id;

      if (!phoneRes.ok) {
        logger.error(
          {
            status: phoneRes.status,
            error: phoneData.error?.message,
            wabaId,
          },
          "Meta phone number lookup failed",
        );
      }
    }

    /**
     * Make sure we received both IDs.
     */
    if (!wabaId || !phoneNumberId) {
      logger.error(
        {
          hasWabaId: Boolean(wabaId),
          hasPhoneNumberId: Boolean(phoneNumberId),
        },
        "Meta onboarding did not return a WABA and phone number",
      );

      res.status(502).json({
        error:
          "Meta did not return a WhatsApp Business Account and phone number",
      });

      return;
    }

    /**
     * Subscribe this tenant WABA to the app webhook before marking the
     * connection as active. Outbound sends can work without this subscription,
     * but inbound customer replies would never reach Live Chat.
     */
    try {
      await ensureWhatsAppWebhookSubscription(wabaId, accessToken);
      logger.info(
        { userId: ownerUserId, wabaId, phoneNumberId },
        "WhatsApp WABA subscribed to application webhooks",
      );
    } catch (subscriptionError) {
      logger.error(
        {
          err: subscriptionError,
          userId: ownerUserId,
          wabaId,
          phoneNumberId,
        },
        "WhatsApp WABA webhook subscription failed",
      );
      res.status(502).json({
        error:
          "WhatsApp connected, but Meta webhook subscription failed. Please reconnect the Facebook account.",
      });
      return;
    }

    /**
     * Also upsert encrypted credentials into whatsappcredentials collection.
     * This is the source of truth used by all outbound message sending.
     */
    let accessTokenEncrypted: string;
    try {
      const credentialsKey = process.env["WHATSAPP_CREDENTIALS_KEY"] ?? "";
      logger.info(
        {
          keyConfigured: credentialsKey.length > 0,
          keyLength: credentialsKey.length,
          keyLooksLike64Hex: /^[0-9a-fA-F]{64}$/.test(credentialsKey),
          decodedKeyByteLength: Buffer.from(credentialsKey, "hex").length,
          hasOuterWhitespace: credentialsKey !== credentialsKey.trim(),
          hasQuoteCharacters: credentialsKey.includes('"') || credentialsKey.includes("'"),
        },
        "WhatsApp credential encryption: starting",
      );
      accessTokenEncrypted = encryptToken(accessToken);
    } catch (encryptionErr) {
      logger.error(
        {
          err: encryptionErr,
          userId: ownerUserId,
          errorDetail: encryptionErr instanceof Error ? encryptionErr.message : String(encryptionErr),
        },
        "WhatsApp credential encryption failed",
      );
      res.status(502).json({
        error: "WhatsApp credentials could not be encrypted securely. Please retry the connection.",
      });
      return;
    }

    try {
      await runWithTenant(ownerUserId, () =>
        WhatsAppCredentialModel.findOneAndUpdate(
          { userId: new mongoose.Types.ObjectId(ownerUserId) },
          {
            userId: new mongoose.Types.ObjectId(ownerUserId),
            wabaId,
            phoneNumberId,
            accessTokenEncrypted,
          },
          { upsert: true, returnDocument: "after" },
        ),
      );

      logger.info(
        { userId: ownerUserId, wabaId, phoneNumberId },
        "WhatsApp credentials encrypted and stored in whatsappcredentials",
      );
    } catch (databaseErr) {
      logger.error(
        {
          err: databaseErr,
          userId: ownerUserId,
          wabaId,
          phoneNumberId,
          errorDetail: databaseErr instanceof Error ? databaseErr.message : String(databaseErr),
        },
        "WhatsApp credential MongoDB save failed",
      );
      res.status(502).json({
        error:
          "WhatsApp credentials could not be saved to the account. Please retry the connection.",
      });
      return;
    }

    /**
     * Save the User connection state only after encrypted credential storage
     * succeeds, so the UI cannot show connected without usable credentials.
     */
    await UserModel.findByIdAndUpdate(ownerUserId, {
      metaWabaConnected: true,
      metaWabaId: wabaId,
      metaPhoneNumberId: phoneNumberId,
      $unset: {
        metaEmbeddedSignupCode: 1,
        metaWabaAccessToken: 1,
      },
    });

    logger.info(
      {
        userId: ownerUserId,
        wabaId,
        phoneNumberId,
      },
      "WhatsApp Business Account connected via Embedded Signup",
    );

    res.json({
      ok: true,
      wabaId,
      phoneNumberId,
    });
  } catch (err) {
    logger.error(
      { err },
      "Error during Facebook Embedded Signup token exchange",
    );

    res.status(500).json({
      error: "Internal server error during token exchange",
    });
  }
}

/**
 * POST /api/whatsapp/onboard
 */
router.post("/whatsapp/onboard", authenticate, onboardWhatsApp);

/**
 * Keep the old route working.
 */
router.post("/integration/facebook/connect", authenticate, onboardWhatsApp);

router.post(
  "/master-admin/users/:id/connect",
  authenticate,
  requireMasterAdmin,
  async (req: AuthRequest, res) => {
    req.body = { ...(req.body ?? {}), targetUserId: req.params.id };
    await onboardWhatsApp(req, res);
  },
);

/**
 * POST /api/integration/facebook/reset
 * Kept as a compatibility endpoint for older clients. Reconnects must not
 * delete a working credential before a replacement signup has succeeded.
 */
router.post(
  "/integration/facebook/reset",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);
      const user = await UserModel.findById(userId).select("email isProtectedMasterAdmin").lean();
      if (isProtectedMasterAdminUser(user)) {
        res.status(409).json({ error: "This protected Master Admin account uses ecosystem WhatsApp credentials" });
        return;
      }
      logger.info({ userId: req.user!.userId }, "Ignored legacy WhatsApp reset request; existing credentials were preserved");
      res.json({ ok: true, preserved: true });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "WhatsApp connection reset failed");
      res.status(500).json({ error: "Unable to reset the WhatsApp connection" });
    }
  },
);

/**
 * GET /api/integration/facebook/recovery-status
 * Reports whether the authenticated user's old control-plane credential can
 * be restored. Credential contents and identifiers are never returned.
 */
router.get(
  "/integration/facebook/recovery-status",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);
      const userIdString = String(userId);
      const user = await UserModel.findById(userId).select("isProtectedMasterAdmin").lean();
      if (isProtectedMasterAdminUser(user)) {
        res.json({
          isProtectedMasterAdmin: true,
          credentialStored: true,
          credentialReadable: true,
          legacyCredentialFound: false,
          legacyCredentialReadable: false,
          canRestoreLegacy: false,
        });
        return;
      }

      const controlPlaneDb = mongoose.connection.db;
      if (!controlPlaneDb) throw new Error("MongoDB is not connected");
      const legacyCredential = await controlPlaneDb
        .collection("whatsappcredentials")
        .findOne(
          { userId },
          { projection: { accessTokenEncrypted: 1 } },
        );
      const tenantCredential = await runWithTenant(userIdString, () =>
        WhatsAppCredentialModel.findOne({ userId })
          .select("accessTokenEncrypted")
          .lean(),
      );

      const canDecrypt = (encrypted: unknown) => {
        if (typeof encrypted !== "string" || !encrypted) return false;
        try {
          decryptToken(encrypted);
          return true;
        } catch {
          return false;
        }
      };
      const legacyCredentialReadable = canDecrypt(legacyCredential?.accessTokenEncrypted);
      const credentialReadable = canDecrypt(tenantCredential?.accessTokenEncrypted);
      const credentialStored = Boolean(tenantCredential);

      res.json({
        isProtectedMasterAdmin: false,
        credentialStored,
        credentialReadable,
        legacyCredentialFound: Boolean(legacyCredential),
        legacyCredentialReadable,
        canRestoreLegacy: !credentialStored && legacyCredentialReadable,
      });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "Facebook credential recovery status lookup failed");
      res.status(500).json({ error: "Unable to check for a saved Facebook connection" });
    }
  },
);

/**
 * POST /api/integration/facebook/restore-legacy
 * Restores only the authenticated user's encrypted legacy credential, and
 * only when their tenant database does not already contain a credential.
 */
router.post(
  "/integration/facebook/restore-legacy",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);
      const userIdString = String(userId);
      const user = await UserModel.findById(userId).select("isProtectedMasterAdmin").lean();
      if (isProtectedMasterAdminUser(user)) {
        res.status(409).json({ error: "This protected Master Admin account uses ecosystem WhatsApp credentials" });
        return;
      }

      const existingCredential = await runWithTenant(userIdString, () =>
        WhatsAppCredentialModel.findOne({ userId }).select("_id").lean(),
      );
      if (existingCredential) {
        res.status(409).json({ error: "A WhatsApp credential already exists. It was not changed." });
        return;
      }

      const controlPlaneDb = mongoose.connection.db;
      if (!controlPlaneDb) throw new Error("MongoDB is not connected");
      const legacyCredential = await controlPlaneDb
        .collection("whatsappcredentials")
        .findOne(
          { userId },
          {
            projection: {
              wabaId: 1,
              phoneNumberId: 1,
              accessTokenEncrypted: 1,
              metaCatalogId: 1,
              catalogName: 1,
              catalogConnected: 1,
              catalogLastSyncedAt: 1,
            },
          },
        );

      if (
        !legacyCredential ||
        typeof legacyCredential.wabaId !== "string" ||
        typeof legacyCredential.phoneNumberId !== "string" ||
        typeof legacyCredential.accessTokenEncrypted !== "string"
      ) {
        res.status(404).json({ error: "No complete saved Facebook connection was found for this account" });
        return;
      }

      try {
        decryptToken(legacyCredential.accessTokenEncrypted);
      } catch {
        res.status(409).json({
          error: "A saved connection was found but cannot be restored securely. Reconnect through Facebook instead.",
        });
        return;
      }

      try {
        await runWithTenant(userIdString, async () => {
          await WhatsAppCredentialModel.create({
            userId,
            wabaId: legacyCredential.wabaId,
            phoneNumberId: legacyCredential.phoneNumberId,
            accessTokenEncrypted: legacyCredential.accessTokenEncrypted,
            ...(typeof legacyCredential.metaCatalogId === "string" && {
              metaCatalogId: legacyCredential.metaCatalogId,
            }),
            ...(typeof legacyCredential.catalogName === "string" && {
              catalogName: legacyCredential.catalogName,
            }),
            ...(typeof legacyCredential.catalogConnected === "boolean" && {
              catalogConnected: legacyCredential.catalogConnected,
            }),
            ...(legacyCredential.catalogLastSyncedAt instanceof Date && {
              catalogLastSyncedAt: legacyCredential.catalogLastSyncedAt,
            }),
          });
        });
      } catch (error) {
        if ((error as { code?: number })?.code === 11000) {
          res.status(409).json({ error: "A WhatsApp credential already exists. It was not changed." });
          return;
        }
        throw error;
      }

      await UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            metaWabaConnected: true,
            metaWabaId: legacyCredential.wabaId,
            metaPhoneNumberId: legacyCredential.phoneNumberId,
          },
          $unset: {
            metaWabaAccessToken: 1,
            metaEmbeddedSignupCode: 1,
          },
        },
      );

      let webhookSubscriptionConfirmed = false;
      try {
        await ensureWhatsAppWebhookSubscription(
          legacyCredential.wabaId,
          decryptToken(legacyCredential.accessTokenEncrypted),
        );
        webhookSubscriptionConfirmed = true;
      } catch (error) {
        logger.warn(
          { err: error, userId: userIdString },
          "Legacy WhatsApp credential restored, but its webhook subscription could not be confirmed",
        );
      }

      logger.info({ userId: userIdString }, "Restored encrypted legacy WhatsApp credential to tenant database");
      res.json({
        ok: true,
        restored: true,
        connected: true,
        webhookSubscriptionConfirmed,
      });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "Facebook legacy credential restore failed");
      res.status(500).json({ error: "Unable to restore the saved Facebook connection" });
    }
  },
);

/**
 * POST /api/integration/facebook/repair-webhook-subscription
 * Re-subscribes only the authenticated tenant's stored WABA credential.
 */
router.post(
  "/integration/facebook/repair-webhook-subscription",
  authenticate,
  async (req: AuthRequest, res): Promise<void> => {
    const userIdString = req.user!.userId;
    try {
      const userId = new mongoose.Types.ObjectId(userIdString);
      const user = await UserModel.findById(userId)
        .select("isProtectedMasterAdmin metaPhoneNumberId metaWabaId metaWabaConnected")
        .lean();
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (isProtectedMasterAdminUser(user)) {
        res.status(409).json({ error: "Protected Master Admin credentials are repaired separately" });
        return;
      }

      const credential = await runWithTenant(userIdString, () =>
        WhatsAppCredentialModel.findOne({ userId })
          .select("wabaId phoneNumberId accessTokenEncrypted")
          .lean(),
      );
      if (!credential) {
        res.status(404).json({ error: "No saved WhatsApp connection was found for this account" });
        return;
      }

      let accessToken: string;
      try {
        accessToken = decryptToken(credential.accessTokenEncrypted);
      } catch {
        res.status(409).json({ error: "The saved WhatsApp connection cannot be read securely" });
        return;
      }

      if (typeof credential.wabaId !== "string" || !credential.wabaId) {
        res.status(409).json({ error: "The saved WhatsApp connection is missing its business account ID" });
        return;
      }

      if (typeof credential.phoneNumberId !== "string" || !credential.phoneNumberId) {
        res.status(409).json({ error: "The saved WhatsApp connection is missing its phone number ID" });
        return;
      }

      const conflictingOwner = await UserModel.findOne({
        _id: { $ne: userId },
        $or: [
          { metaPhoneNumberId: credential.phoneNumberId },
          { metaWabaId: credential.wabaId },
        ],
      })
        .select("_id")
        .lean();
      if (conflictingOwner) {
        res.status(409).json({
          error: "The saved WhatsApp number or business account is already assigned to another account",
        });
        return;
      }

      const mappingNeedsRepair =
        user.metaPhoneNumberId !== credential.phoneNumberId ||
        user.metaWabaId !== credential.wabaId ||
        user.metaWabaConnected !== true;
      if (mappingNeedsRepair) {
        await UserModel.updateOne(
          { _id: userId },
          {
            $set: {
              metaPhoneNumberId: credential.phoneNumberId,
              metaWabaId: credential.wabaId,
              metaWabaConnected: true,
            },
          },
        );
        logger.info(
          { userId: userIdString, phoneNumberId: credential.phoneNumberId },
          "Reconciled WhatsApp webhook ownership from the saved tenant credential",
        );
      }

      await ensureWhatsAppWebhookSubscription(credential.wabaId, accessToken);
      res.json({ ok: true, subscribed: true, mappingReconciled: mappingNeedsRepair });
    } catch (error) {
      logger.error(
        { err: error, userId: userIdString },
        "Facebook webhook subscription repair failed",
      );
      res.status(500).json({ error: "Unable to confirm the WhatsApp webhook subscription" });
    }
  },
);

/**
 * GET /api/integration/facebook/status
 */
router.get(
  "/integration/facebook/status",
  authenticate,
  async (req: AuthRequest, res) => {
    const user = await UserModel.findById(req.user!.userId).select(
      "email isProtectedMasterAdmin metaWabaConnected metaWabaId metaPhoneNumberId",
    );
    const credential = await WhatsAppCredentialModel.findOne({
      userId: req.user!.userId,
    }).select("wabaId phoneNumberId accessTokenEncrypted").lean();

    let credentialReadable = false;
    if (credential) {
      try {
        decryptToken(credential.accessTokenEncrypted);
        credentialReadable = true;
      } catch {
        credentialReadable = false;
      }
    }

    const protectedAccount = isProtectedMasterAdminUser(user);
    const ecosystemIds = protectedAccount ? getEcosystemWhatsAppCredentialIds() : null;
    res.json({
      connected: protectedAccount || user?.metaWabaConnected === true,
      source: protectedAccount ? "ecosystem" : "facebook",
      wabaId: ecosystemIds?.wabaId ?? user?.metaWabaId ?? null,
      phoneNumberId: ecosystemIds?.phoneNumberId ?? user?.metaPhoneNumberId ?? credential?.phoneNumberId ?? null,
      credentialStored: protectedAccount || Boolean(credential),
      credentialReadable: protectedAccount || credentialReadable,
      isProtectedMasterAdmin: protectedAccount,
    });
  },
);

/**
 * GET /api/integration/whatsapp/catalog-settings
 *
 * Local tenant settings only. This endpoint does not call Meta.
 */
router.get(
  "/integration/whatsapp/catalog-settings",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const credential = await getTenantCatalogRecord(req.user!.userId);
      res.json({ settings: shapeCatalogSettings(credential) });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "Catalog settings lookup failed");
      res.status(500).json({ error: "Unable to load catalog settings" });
    }
  },
);

router.get(
  "/integration/whatsapp/catalog-context",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const context = await getTenantMetaCatalogContext(
        credentials.wabaId,
        credentials.accessToken,
      );
      res.json(context);
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta catalog creation context lookup failed",
      );
    }
  },
);

/**
 * GET /api/integration/whatsapp/catalogs
 *
 * Discovers Commerce Catalogs available to this tenant's connected WABA.
 */
router.get(
  "/integration/whatsapp/catalogs",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const business = await getOwningMetaBusiness(
        credentials.wabaId,
        credentials.accessToken,
      );
      const [connected, owned] = await Promise.all([
        metaCatalogRequest<{ data?: MetaCatalog[] }>(
          "GET",
          `${encodeURIComponent(credentials.wabaId)}/product_catalogs`,
          credentials.accessToken,
          { fields: "id,name,vertical", limit: 100 },
        ),
        metaCatalogRequest<{ data?: MetaCatalog[] }>(
          "GET",
          `${encodeURIComponent(business.id)}/owned_product_catalogs`,
          credentials.accessToken,
          { fields: "id,name,vertical", limit: 100 },
        ),
      ]);
      const catalogsById = new Map<string, MetaCatalog>();
      for (const catalog of [...(owned.data ?? []), ...(connected.data ?? [])]) {
        if (catalog.id) catalogsById.set(catalog.id, catalog);
      }
      res.json({
        catalogs: [...catalogsById.values()],
      });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog discovery failed",
      );
    }
  },
);

/**
 * POST /api/integration/whatsapp/catalogs/connect
 *
 * Verifies and attaches the selected catalog to the tenant's WABA, then stores
 * the tenant-scoped connection settings.
 */
router.post(
  "/integration/whatsapp/catalogs",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const pageId = typeof req.body?.pageId === "string" ? req.body.pageId.trim() : "";
      if (!name || name.length > 100) {
        throw new CatalogRouteError(
          "Catalog name is required and must be 100 characters or fewer",
          400,
        );
      }
      if (!/^\d{1,32}$/.test(pageId)) {
        throw new CatalogRouteError("Choose a valid Meta Page", 400);
      }

      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const context = await getTenantMetaCatalogContext(
        credentials.wabaId,
        credentials.accessToken,
      );
      if (!context.pages.some((page) => page.id === pageId)) {
        throw new CatalogRouteError(
          "The selected Page is not owned by the business connected to this WhatsApp account",
          400,
        );
      }

      const created = await metaCatalogRequest<{ id?: string }>(
        "POST",
        `${encodeURIComponent(context.businessId)}/owned_product_catalogs`,
        credentials.accessToken,
        {
          name,
          vertical: "commerce",
          business_metadata: JSON.stringify({ page_id: pageId }),
          store_catalog_settings: JSON.stringify({ page_id: pageId }),
        },
      );
      if (!created.id) {
        throw new Error("Meta did not return the created catalog ID");
      }

      const catalog = await metaCatalogRequest<MetaCatalog>(
        "GET",
        encodeURIComponent(created.id),
        credentials.accessToken,
        { fields: "id,name,vertical" },
      );
      const attached = await metaCatalogRequest<{ success?: boolean }>(
        "POST",
        `${encodeURIComponent(credentials.wabaId)}/product_catalogs`,
        credentials.accessToken,
        { catalog_id: created.id },
      );
      if (attached.success === false) {
        throw new Error("Meta created the catalog but did not attach it to WhatsApp");
      }

      const saved = await saveTenantCatalogSettings(req.user!.userId, {
        ...catalog,
        id: catalog.id || created.id,
        name: catalog.name || name,
        vertical: catalog.vertical || "commerce",
      });
      if (!saved) {
        throw new CatalogRouteError(
          "Meta attached the catalog, but Airavata could not save the connection record",
          500,
        );
      }
      res.status(201).json({ settings: shapeCatalogSettings(saved) });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog creation failed",
      );
    }
  },
);

router.post(
  "/integration/whatsapp/catalogs/connect",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const catalogId = typeof req.body?.catalogId === "string"
        ? req.body.catalogId.trim()
        : "";
      if (!/^\d{1,32}$/.test(catalogId)) {
        throw new CatalogRouteError("A valid Meta catalog ID is required", 400);
      }

      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const catalog = await metaCatalogRequest<MetaCatalog>(
        "GET",
        encodeURIComponent(catalogId),
        credentials.accessToken,
        { fields: "id,name,vertical" },
      );
      if (!catalog.id) {
        res.status(502).json({ error: "Meta returned an invalid catalog" });
        return;
      }
      const attached = await metaCatalogRequest<{ success?: boolean }>(
        "POST",
        `${encodeURIComponent(credentials.wabaId)}/product_catalogs`,
        credentials.accessToken,
        { catalog_id: catalog.id },
      );
      if (attached.success === false) {
        throw new Error("Meta did not attach the catalog to this WhatsApp account");
      }
      const saved = await saveTenantCatalogSettings(req.user!.userId, catalog);

      if (!saved) {
        res.status(404).json({ error: "WhatsApp credentials are not connected for this tenant" });
        return;
      }

      res.json({ settings: shapeCatalogSettings(saved) });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog connection failed",
      );
    }
  },
);

router.get(
  "/integration/whatsapp/catalog/visibility",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const result = await metaCatalogRequest<{
        data?: Array<{
          is_catalog_visible?: boolean;
          is_cart_enabled?: boolean;
        }>;
      }>(
        "GET",
        `${encodeURIComponent(credentials.phoneNumberId)}/whatsapp_commerce_settings`,
        credentials.accessToken,
      );
      const settings = result.data?.[0];
      res.json({
        isCatalogVisible: settings?.is_catalog_visible === true,
        isCartEnabled: settings?.is_cart_enabled !== false,
      });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta WhatsApp commerce settings lookup failed",
      );
    }
  },
);

router.patch(
  "/integration/whatsapp/catalog/visibility",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const isCatalogVisible = req.body?.isCatalogVisible;
      const isCartEnabled = req.body?.isCartEnabled;
      if (
        typeof isCatalogVisible !== "boolean" ||
        typeof isCartEnabled !== "boolean"
      ) {
        throw new CatalogRouteError(
          "Catalog visibility and cart settings must be true or false",
          400,
        );
      }
      const catalog = await getTenantCatalogRecord(req.user!.userId);
      if (
        isCatalogVisible &&
        (!catalog?.catalogConnected || !catalog.metaCatalogId)
      ) {
        throw new CatalogRouteError(
          "Connect a catalog before making it visible on WhatsApp",
          409,
        );
      }
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const result = await metaCatalogRequest<{ success?: boolean }>(
        "POST",
        `${encodeURIComponent(credentials.phoneNumberId)}/whatsapp_commerce_settings`,
        credentials.accessToken,
        {
          is_catalog_visible: isCatalogVisible,
          is_cart_enabled: isCartEnabled,
        },
      );
      if (result.success === false) {
        throw new Error("Meta did not save the WhatsApp commerce settings");
      }
      res.json({ isCatalogVisible, isCartEnabled });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta WhatsApp commerce settings update failed",
      );
    }
  },
);

/**
 * GET /api/integration/whatsapp/catalog/products
 */
router.get(
  "/integration/whatsapp/catalog/products",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const credential = await getTenantCatalogRecord(req.user!.userId);
      if (!credential?.catalogConnected || !credential.metaCatalogId) {
        throw new CatalogRouteError(
          "Connect a Commerce Catalog before loading products",
          409,
        );
      }
      const after = typeof req.query.after === "string" ? req.query.after : "";
      const requestedLimit =
        typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
      if (after.length > 512) {
        throw new CatalogRouteError("The product page cursor is invalid", 400);
      }
      if (
        !Number.isInteger(requestedLimit) ||
        requestedLimit < 1 ||
        requestedLimit > 100
      ) {
        throw new CatalogRouteError("Product page size must be between 1 and 100", 400);
      }
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const data = await metaCatalogRequest<{
        data?: MetaProduct[];
        paging?: { next?: string; cursors?: { after?: string } };
      }>(
        "GET",
        `${encodeURIComponent(credential.metaCatalogId)}/products`,
        credentials.accessToken,
        {
          fields: "id,name,description,price,currency,image_url,retailer_id,availability,product_type",
          limit: requestedLimit,
          ...(after ? { after } : {}),
        },
      );
      res.json({
        products: (data.data ?? [])
          .filter((product) => Boolean(product.id))
          .map(normalizeMetaProduct),
        nextCursor: data.paging?.next ? data.paging.cursors?.after ?? null : null,
        hasMore: Boolean(data.paging?.next),
      });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog product listing failed",
      );
    }
  },
);

/**
 * POST /api/integration/whatsapp/catalog/products
 */
router.post(
  "/integration/whatsapp/catalog/products",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const input = parseCatalogProductInput(req.body);
      const credential = await getTenantCatalogRecord(req.user!.userId);
      if (!credential?.catalogConnected || !credential.metaCatalogId) {
        throw new CatalogRouteError(
          "Connect a Commerce Catalog before adding products",
          409,
        );
      }
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      const created = await metaCatalogRequest<{ id?: string }>(
        "POST",
        `${encodeURIComponent(credential.metaCatalogId)}/products`,
        credentials.accessToken,
        { ...toMetaProductFields(input), allow_upsert: false },
      );
      if (!created.id) {
        throw new Error("Meta did not return a created product ID");
      }
      res.status(201).json({
        product: {
          id: created.id,
          name: input.name,
          description: input.description,
          price: input.price,
          currency: input.currency,
          image_url: input.imageUrl,
          retailer_id: input.retailerId,
          availability: input.availability,
          product_type: input.productType ?? null,
        },
      });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog product creation failed",
      );
    }
  },
);

async function assertProductBelongsToConnectedCatalog(
  productId: string,
  catalogId: string,
  accessToken: string,
): Promise<void> {
  let product: {
    id?: string;
    product_catalog?: { id?: string } | string;
  };
  try {
    product = await metaCatalogRequest(
      "GET",
      encodeURIComponent(productId),
      accessToken,
      { fields: "id,product_catalog" },
    );
  } catch (error) {
    const metaError = (error as Error & {
      meta?: { code?: number };
    }).meta;
    if (metaError?.code === 100 || metaError?.code === 803) {
      throw new CatalogRouteError("Product was not found in this catalog", 404);
    }
    throw error;
  }
  const productCatalogId =
    typeof product.product_catalog === "string"
      ? product.product_catalog
      : product.product_catalog?.id;
  if (!product.id || productCatalogId !== catalogId) {
    throw new CatalogRouteError("Product was not found in this catalog", 404);
  }
}

router.patch(
  "/integration/whatsapp/catalog/products/:productId",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const productId =
        typeof req.params.productId === "string" ? req.params.productId : "";
      if (!/^\d{1,32}$/.test(productId)) {
        throw new CatalogRouteError("A valid Meta product ID is required", 400);
      }
      const input = parseCatalogProductInput(req.body);
      const catalog = await getTenantCatalogRecord(req.user!.userId);
      if (!catalog?.catalogConnected || !catalog.metaCatalogId) {
        throw new CatalogRouteError(
          "Connect a Commerce Catalog before updating products",
          409,
        );
      }
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      await assertProductBelongsToConnectedCatalog(
        productId,
        catalog.metaCatalogId,
        credentials.accessToken,
      );
      const result = await metaCatalogRequest<{ success?: boolean }>(
        "POST",
        encodeURIComponent(productId),
        credentials.accessToken,
        toMetaProductFields(input),
      );
      if (result.success === false) {
        throw new Error("Meta did not save the product changes");
      }
      res.json({
        product: {
          id: productId,
          name: input.name,
          description: input.description,
          price: input.price,
          currency: input.currency,
          image_url: input.imageUrl,
          retailer_id: input.retailerId,
          availability: input.availability,
          product_type: input.productType ?? null,
        },
      });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog product update failed",
      );
    }
  },
);

router.delete(
  "/integration/whatsapp/catalog/products/:productId",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const productId =
        typeof req.params.productId === "string" ? req.params.productId : "";
      if (!/^\d{1,32}$/.test(productId)) {
        throw new CatalogRouteError("A valid Meta product ID is required", 400);
      }
      const catalog = await getTenantCatalogRecord(req.user!.userId);
      if (!catalog?.catalogConnected || !catalog.metaCatalogId) {
        throw new CatalogRouteError(
          "Connect a Commerce Catalog before deleting products",
          409,
        );
      }
      const credentials = await requireTenantCatalogCredentials(req.user!.userId);
      await assertProductBelongsToConnectedCatalog(
        productId,
        catalog.metaCatalogId,
        credentials.accessToken,
      );
      const result = await metaCatalogRequest<{ success?: boolean }>(
        "DELETE",
        encodeURIComponent(productId),
        credentials.accessToken,
      );
      if (result.success === false) {
        throw new Error("Meta did not delete the product");
      }
      res.json({ ok: true });
    } catch (error) {
      sendCatalogError(
        res,
        error,
        req.user!.userId,
        "Meta Commerce Catalog product deletion failed",
      );
    }
  },
);

export default router;
