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

const router = Router();

const META_APP_ID = process.env.META_APP_ID ?? "1324395306544610";
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";

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
    if (!(await UserModel.exists({ _id: ownerUserId }))) {
      res.status(404).json({ error: "Target user not found" });
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
      "metaWabaConnected metaWabaId metaPhoneNumberId",
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

    res.json({
      connected: user?.metaWabaConnected ?? false,
      wabaId: user?.metaWabaId ?? null,
      phoneNumberId: user?.metaPhoneNumberId ?? credential?.phoneNumberId ?? null,
      credentialStored: Boolean(credential),
      credentialReadable,
    });
  },
);

export default router;
