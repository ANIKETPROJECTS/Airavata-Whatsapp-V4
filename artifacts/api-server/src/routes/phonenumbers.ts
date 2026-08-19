/**
 * GET /api/phonenumbers
 * Fetches the phone number details registered to this WABA from Meta's Graph API.
 */
import { Router } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { getCredentials } from "../lib/whatsapp";

const router = Router();

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

router.get("/phonenumbers", authenticate, async (req: AuthRequest, res) => {
  try {
    const { wabaId, accessToken } = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });
    if (!wabaId) {
      return res.status(409).json({ error: "WhatsApp is not connected for this account" });
    }

    const resp = await fetch(
      `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,status`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = (await resp.json()) as {
      data?: Array<{
        id: string;
        display_phone_number: string;
        verified_name: string;
        quality_rating: string;
        messaging_limit_tier: string;
        status: string;
      }>;
      error?: { message: string };
    };

    if (data.error) {
      return res.status(502).json({ error: data.error.message });
    }

    const numbers = (data.data ?? []).map((pn) => ({
      id: pn.id,
      number: pn.display_phone_number,
      verifiedName: pn.verified_name,
      quality: pn.quality_rating ?? "UNKNOWN",
      messagingTier: pn.messaging_limit_tier ?? "—",
      status: pn.status ?? "CONNECTED",
      verified: true,
    }));

    res.json({ numbers });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "WhatsApp is not connected for this account") {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
