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

type MetaCatalog = {
  id: string;
  name?: string;
  vertical?: string;
};

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
          { upsert: true, new: true },
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
 * Clears only the authenticated user's old WhatsApp connection. Workspace
 * records such as contacts, templates, campaigns, and messages are preserved.
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
      await runWithTenant(String(userId), () =>
        WhatsAppCredentialModel.deleteOne({ userId }),
      );
      await UserModel.updateOne(
        { _id: userId },
        {
          $set: { metaWabaConnected: false },
          $unset: {
            metaWabaId: 1,
            metaPhoneNumberId: 1,
            metaWabaAccessToken: 1,
            metaEmbeddedSignupCode: 1,
          },
        },
      );
      logger.info({ userId: req.user!.userId }, "WhatsApp connection reset for reconnect");
      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "WhatsApp connection reset failed");
      res.status(500).json({ error: "Unable to reset the WhatsApp connection" });
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
      const credential = await WhatsAppCredentialModel.findOne({
        userId: req.user!.userId,
      })
        .select("metaCatalogId catalogName catalogConnected catalogLastSyncedAt")
        .lean();

      res.json({
        settings: {
          metaCatalogId: credential?.metaCatalogId ?? null,
          catalogName: credential?.catalogName ?? null,
          catalogConnected: credential?.catalogConnected === true,
          catalogLastSyncedAt: credential?.catalogLastSyncedAt ?? null,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "Catalog settings lookup failed");
      res.status(500).json({ error: "Unable to load catalog settings" });
    }
  },
);

/**
 * PATCH /api/integration/whatsapp/catalog-settings
 *
 * Saves local tenant settings only. No Meta API calls are made.
 */
router.patch(
  "/integration/whatsapp/catalog-settings",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const body = (req.body ?? {}) as {
        metaCatalogId?: unknown;
        catalogName?: unknown;
        catalogConnected?: unknown;
        catalogLastSyncedAt?: unknown;
      };
      const update: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};

      if (body.metaCatalogId !== undefined) {
        if (body.metaCatalogId === null || body.metaCatalogId === "") {
          unset.metaCatalogId = 1;
        } else if (typeof body.metaCatalogId === "string" && body.metaCatalogId.trim()) {
          update.metaCatalogId = body.metaCatalogId.trim();
        } else {
          res.status(400).json({ error: "metaCatalogId must be a non-empty string or null" });
          return;
        }
      }

      if (body.catalogName !== undefined) {
        if (body.catalogName === null || body.catalogName === "") {
          unset.catalogName = 1;
        } else if (typeof body.catalogName === "string" && body.catalogName.trim()) {
          update.catalogName = body.catalogName.trim();
        } else {
          res.status(400).json({ error: "catalogName must be a non-empty string or null" });
          return;
        }
      }

      if (body.catalogConnected !== undefined) {
        if (typeof body.catalogConnected !== "boolean") {
          res.status(400).json({ error: "catalogConnected must be a boolean" });
          return;
        }
        update.catalogConnected = body.catalogConnected;
      }

      if (body.catalogLastSyncedAt !== undefined) {
        if (body.catalogLastSyncedAt === null || body.catalogLastSyncedAt === "") {
          unset.catalogLastSyncedAt = 1;
        } else if (
          typeof body.catalogLastSyncedAt === "string" &&
          !Number.isNaN(Date.parse(body.catalogLastSyncedAt))
        ) {
          update.catalogLastSyncedAt = new Date(body.catalogLastSyncedAt);
        } else {
          res.status(400).json({ error: "catalogLastSyncedAt must be a valid ISO date or null" });
          return;
        }
      }

      if (Object.keys(update).length === 0 && Object.keys(unset).length === 0) {
        res.status(400).json({ error: "At least one catalog setting is required" });
        return;
      }

      const updateDocument: Record<string, unknown> = {};
      if (Object.keys(update).length > 0) updateDocument.$set = update;
      if (Object.keys(unset).length > 0) updateDocument.$unset = unset;

      const credential = await WhatsAppCredentialModel.findOneAndUpdate(
        { userId: req.user!.userId },
        updateDocument,
        {
          new: true,
          runValidators: true,
        },
      )
        .select("metaCatalogId catalogName catalogConnected catalogLastSyncedAt")
        .lean();

      if (!credential) {
        res.status(404).json({ error: "WhatsApp credentials are not connected for this tenant" });
        return;
      }

      res.json({
        settings: {
          metaCatalogId: credential.metaCatalogId ?? null,
          catalogName: credential.catalogName ?? null,
          catalogConnected: credential.catalogConnected === true,
          catalogLastSyncedAt: credential.catalogLastSyncedAt ?? null,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId: req.user!.userId }, "Catalog settings save failed");
      res.status(500).json({ error: "Unable to save catalog settings" });
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
      const user = await UserModel.findById(req.user!.userId)
        .select("isProtectedMasterAdmin")
        .lean();
      const protectedAccount = isProtectedMasterAdminUser(user);
      const credentials = await getCredentials(req.user!.userId, {
        allowEnvFallback: false,
      });
      if (!credentials.wabaId) {
        res.status(409).json({ error: "Connected WhatsApp account has no WABA ID" });
        return;
      }

      const data = await metaGet<{ data?: MetaCatalog[] }>(
        `${encodeURIComponent(credentials.wabaId)}/product_catalogs?fields=id,name,vertical&limit=100`,
        credentials.accessToken,
      );
      res.json({
        catalogs: (data.data ?? []).filter((catalog) => Boolean(catalog.id)),
        source: protectedAccount ? "ecosystem" : "tenant",
      });
    } catch (error) {
      const typedError = error as Error & {
        status?: number;
        meta?: Record<string, unknown>;
      };
      logger.error(
        { err: error, userId: req.user!.userId },
        "Meta Commerce Catalog discovery failed",
      );
      res.status(502).json({
        error: typedError.message || "Unable to discover Commerce Catalogs",
        meta: typedError.meta,
      });
    }
  },
);

/**
 * POST /api/integration/whatsapp/catalogs/connect
 *
 * Verifies the selected catalog with the tenant's token and stores the local
 * connection settings. The catalog itself is not modified.
 */
router.post(
  "/integration/whatsapp/catalogs/connect",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const catalogId = typeof req.body?.catalogId === "string"
        ? req.body.catalogId.trim()
        : "";
      if (!catalogId) {
        res.status(400).json({ error: "catalogId is required" });
        return;
      }

      const user = await UserModel.findById(req.user!.userId)
        .select("isProtectedMasterAdmin")
        .lean();
      if (isProtectedMasterAdminUser(user)) {
        res.status(409).json({
          error: "The protected Master Admin account cannot save tenant catalog settings",
        });
        return;
      }

      const credentials = await getCredentials(req.user!.userId, {
        allowEnvFallback: false,
      });
      const catalog = await metaGet<MetaCatalog>(
        `${encodeURIComponent(catalogId)}?fields=id,name,vertical`,
        credentials.accessToken,
      );
      if (!catalog.id) {
        res.status(502).json({ error: "Meta returned an invalid catalog" });
        return;
      }

      const saved = await WhatsAppCredentialModel.findOneAndUpdate(
        { userId: req.user!.userId },
        {
          $set: {
            metaCatalogId: catalog.id,
            catalogName: catalog.name ?? catalog.id,
            catalogConnected: true,
            catalogLastSyncedAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      )
        .select("metaCatalogId catalogName catalogConnected catalogLastSyncedAt")
        .lean();

      if (!saved) {
        res.status(404).json({ error: "WhatsApp credentials are not connected for this tenant" });
        return;
      }

      res.json({
        settings: {
          metaCatalogId: saved.metaCatalogId ?? null,
          catalogName: saved.catalogName ?? null,
          catalogConnected: saved.catalogConnected === true,
          catalogLastSyncedAt: saved.catalogLastSyncedAt ?? null,
        },
      });
    } catch (error) {
      const typedError = error as Error & {
        status?: number;
        meta?: Record<string, unknown>;
      };
      logger.error(
        { err: error, userId: req.user!.userId },
        "Meta Commerce Catalog connection failed",
      );
      res.status(502).json({
        error: typedError.message || "Unable to connect Commerce Catalog",
        meta: typedError.meta,
      });
    }
  },
);

export default router;
