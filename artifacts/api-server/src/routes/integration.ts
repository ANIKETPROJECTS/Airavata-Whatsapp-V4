/**
 * Integration routes — Facebook / WhatsApp Embedded Signup
 *
 * POST /api/whatsapp/onboard
 *   Receives the short-lived auth code from the frontend Embedded Signup popup,
 *   exchanges it for a WhatsApp Business access token via the Meta Graph API,
 *   discovers the shared WABA and phone number, and stores them against the
 *   authenticated user.
 */

import { Router, type Response } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { logger } from "../lib/logger";

const router = Router();

const META_APP_ID = process.env.META_APP_ID ?? "1324395306544610";
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v22.0";

async function onboardWhatsApp(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Missing auth code from Facebook SDK" });
    return;
  }

  if (!META_APP_SECRET) {
    res.status(503).json({ error: "META_APP_SECRET is not configured" });
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
        error?: { message: string };
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        logger.error(
          { status: tokenRes.status, error: tokenData.error?.message },
          "Meta token exchange failed",
        );
        res.status(502).json({
          error: tokenData.error?.message ?? "Meta token exchange failed",
        });
        return;
      }

      const accessToken = tokenData.access_token;

      // Embedded Signup may include IDs in the exchange response. When it
      // doesn't, discover the WABA from the token's granular scopes. Meta's
      // debug_token endpoint returns the WABAs shared during Embedded Signup.
      let wabaId = tokenData.waba_id;
      let phoneNumberId = tokenData.phone_number_id;

      if (!wabaId) {
        const debugTokenUrl =
          `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token` +
          `?input_token=${encodeURIComponent(accessToken)}`;
        const debugTokenRes = await fetch(debugTokenUrl, {
          headers: {
            // The app's configured system-user token is the token Meta
            // expects to authorize inspection of the returned business token.
            Authorization: `Bearer ${process.env.META_ACCESS_TOKEN ?? accessToken}`,
          },
        });
        const debugTokenData = (await debugTokenRes.json()) as {
          data?: {
            granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
          };
          error?: { message?: string };
        };

        wabaId = debugTokenData.data?.granular_scopes
          ?.filter((scope) =>
            scope.scope === "whatsapp_business_management" ||
            scope.scope === "whatsapp_business_messaging",
          )
          .flatMap((scope) => scope.target_ids ?? [])
          .find(Boolean);

        if (!debugTokenRes.ok) {
          logger.warn(
            { status: debugTokenRes.status, error: debugTokenData.error?.message },
            "Meta debug token lookup failed; trying business account fallback",
          );
        }
      }

      // Compatibility fallback for tokens that do not expose granular scopes.
      if (!wabaId) {
        const wabaRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses` +
          `?fields=owned_whatsapp_business_accounts{id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const wabaData = (await wabaRes.json()) as {
          data?: Array<{
            owned_whatsapp_business_accounts?: { data?: Array<{ id?: string }> };
          }>;
          error?: { message?: string };
        };

        wabaId = wabaData.data
          ?.flatMap((business) => business.owned_whatsapp_business_accounts?.data ?? [])
          .find((account) => account.id)?.id;
      }

      if (wabaId && !phoneNumberId) {
        const phoneRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers` +
          `?fields=id,display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const phoneData = (await phoneRes.json()) as {
          data?: Array<{ id?: string }>;
          error?: { message?: string };
        };
        phoneNumberId = phoneData.data?.find((phone) => phone.id)?.id;

        if (!phoneRes.ok) {
          logger.error(
            { status: phoneRes.status, error: phoneData.error?.message, wabaId },
            "Meta phone number lookup failed",
          );
        }
      }

      if (!wabaId || !phoneNumberId) {
        logger.error(
          { hasWabaId: Boolean(wabaId), hasPhoneNumberId: Boolean(phoneNumberId) },
          "Meta onboarding did not return a WABA and phone number",
        );
        res.status(502).json({
          error: "Meta did not return a WhatsApp Business Account and phone number",
        });
        return;
      }

      await UserModel.findByIdAndUpdate(req.user!.userId, {
        metaWabaAccessToken: accessToken,
        metaWabaConnected: true,
        metaWabaId: wabaId,
        metaPhoneNumberId: phoneNumberId,
        $unset: { metaEmbeddedSignupCode: 1 },
      });

      logger.info(
        { userId: req.user!.userId, wabaId, phoneNumberId },
        "WhatsApp Business Account connected via Embedded Signup",
      );

      res.json({ ok: true, wabaId, phoneNumberId });
    } catch (err) {
      logger.error({ err }, "Error during Facebook Embedded Signup token exchange");
      res.status(500).json({ error: "Internal server error during token exchange" });
  }
}

router.post("/whatsapp/onboard", authenticate, onboardWhatsApp);

// Keep the previous route working for older clients while they refresh.
router.post("/integration/facebook/connect", authenticate, onboardWhatsApp);

// GET /api/integration/facebook/status
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
