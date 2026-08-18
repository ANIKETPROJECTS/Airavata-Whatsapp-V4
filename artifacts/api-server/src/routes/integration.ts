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
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { WhatsAppCredentialModel } from "../models/WhatsAppCredential";
import { encryptToken } from "../lib/credentialCrypto";
import { logger } from "../lib/logger";

const router = Router();

const META_APP_ID = process.env.META_APP_ID ?? "1324395306544610";
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";

async function onboardWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  const { code } = req.body as { code?: string };

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

  try {
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

    if (!tokenRes.ok || !tokenData.access_token) {
      logger.error(
        {
          status: tokenRes.status,
          error: tokenData.error?.message,
        },
        "Meta token exchange failed",
      );

      res.status(502).json({
        error: tokenData.error?.message ?? "Meta token exchange failed",
      });

      return;
    }

    const accessToken = tokenData.access_token;

    let wabaId = tokenData.waba_id;
    let phoneNumberId = tokenData.phone_number_id;

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
     * Save WhatsApp connection.
     */
    await UserModel.findByIdAndUpdate(req.user!.userId, {
      metaWabaAccessToken: accessToken,
      metaWabaConnected: true,
      metaWabaId: wabaId,
      metaPhoneNumberId: phoneNumberId,
      $unset: {
        metaEmbeddedSignupCode: 1,
      },
    });

    /**
     * Also upsert encrypted credentials into whatsappcredentials collection.
     * This is the source of truth used by all outbound message sending.
     */
    try {
      const accessTokenEncrypted = encryptToken(accessToken);
      await WhatsAppCredentialModel.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(req.user!.userId) },
        {
          userId: new mongoose.Types.ObjectId(req.user!.userId),
          wabaId,
          phoneNumberId,
          accessTokenEncrypted,
        },
        { upsert: true, new: true },
      );

      logger.info(
        { userId: req.user!.userId },
        "WhatsApp credentials encrypted and stored in whatsappcredentials",
      );
    } catch (credErr) {
      // Log but do not fail the onboarding — user can reconnect to retry
      logger.error(
        { err: credErr, userId: req.user!.userId },
        "Failed to store encrypted WhatsApp credentials",
      );
    }

    logger.info(
      {
        userId: req.user!.userId,
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

/**
 * GET /api/integration/facebook/status
 */
router.get(
  "/integration/facebook/status",
  authenticate,
  async (req: AuthRequest, res) => {
    const user = await UserModel.findById(req.user!.userId).select(
      "metaWabaConnected metaWabaId",
    );

    res.json({
      connected: user?.metaWabaConnected ?? false,
      wabaId: user?.metaWabaId ?? null,
    });
  },
);

export default router;
