/**
 * Integration routes — Facebook / WhatsApp Embedded Signup
 *
 * POST /api/integration/facebook/connect
 *   Receives the short-lived auth code from the frontend Embedded Signup popup,
 *   exchanges it for a system-user access token via the Meta Graph API, then
 *   stores it against the authenticated user so Airavata can call the WhatsApp
 *   API on their behalf.
 */

import { Router } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { logger } from "../lib/logger";

const router = Router();

const META_APP_ID = process.env.META_APP_ID ?? "1324395306544610";
const META_APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_API_VERSION = "v21.0";

// POST /api/integration/facebook/connect
router.post(
  "/integration/facebook/connect",
  authenticate,
  async (req: AuthRequest, res) => {
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ error: "Missing auth code from Facebook SDK" });
      return;
    }

    // ── Exchange code for access token ──────────────────────────────────────
    if (!META_APP_SECRET) {
      // No app secret yet — store the raw code so the admin can exchange it
      // manually. Log a warning so the operator knows to add META_APP_SECRET.
      logger.warn(
        "META_APP_SECRET not set — storing raw Embedded Signup code instead of exchanging for token. " +
        "Add META_APP_SECRET to Replit Secrets to enable automatic token exchange.",
      );

      await UserModel.findByIdAndUpdate(req.user!.userId, {
        metaEmbeddedSignupCode: code,
        metaWabaConnected: true,
      });

      res.json({
        ok: true,
        note: "Code stored; add META_APP_SECRET to exchange for a token automatically.",
      });
      return;
    }

    try {
      // Exchange the short-lived code for an access token
      const tokenUrl =
        `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token` +
        `?client_id=${META_APP_ID}` +
        `&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
        `&code=${encodeURIComponent(code)}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        token_type?: string;
        error?: { message: string };
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        logger.error({ tokenData }, "Meta token exchange failed");
        res.status(502).json({
          error: tokenData.error?.message ?? "Meta token exchange failed",
        });
        return;
      }

      const accessToken = tokenData.access_token;

      // Fetch the WABA ID that the business just shared with us
      const wabaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses` +
        `?fields=owned_whatsapp_business_accounts&access_token=${encodeURIComponent(accessToken)}`,
      );
      const wabaData = (await wabaRes.json()) as {
        data?: Array<{
          owned_whatsapp_business_accounts?: { data?: Array<{ id: string }> };
        }>;
      };

      const wabaId =
        wabaData.data?.[0]?.owned_whatsapp_business_accounts?.data?.[0]?.id;

      await UserModel.findByIdAndUpdate(req.user!.userId, {
        metaWabaAccessToken: accessToken,
        metaWabaConnected: true,
        ...(wabaId && { metaWabaId: wabaId }),
      });

      logger.info(
        { userId: req.user!.userId, wabaId },
        "WhatsApp Business Account connected via Embedded Signup",
      );

      res.json({ ok: true, wabaId });
    } catch (err) {
      logger.error({ err }, "Error during Facebook Embedded Signup token exchange");
      res.status(500).json({ error: "Internal server error during token exchange" });
    }
  },
);

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
