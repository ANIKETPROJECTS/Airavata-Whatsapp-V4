import { Router } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { getCredentials } from "../lib/whatsapp";

const router = Router();
const GRAPH_BASE = "https://graph.facebook.com/v22.0";

type MetaPhone = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

router.get("/whatsapp/business-profile", authenticate, async (req: AuthRequest, res) => {
  try {
    const { wabaId, phoneNumberId, accessToken } = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });

    if (!wabaId || !phoneNumberId) {
      res.status(409).json({ error: "WhatsApp is not connected for this account" });
      return;
    }

    const phoneResponse = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const phonePayload = (await phoneResponse.json()) as {
      data?: MetaPhone[];
      error?: { message?: string };
    };

    if (!phoneResponse.ok) {
      res.status(502).json({ error: phonePayload.error?.message ?? "Unable to fetch the Meta business profile" });
      return;
    }

    const phone = phonePayload.data?.find(item => item.id === phoneNumberId) ?? phonePayload.data?.[0];
    const profileResponse = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile?fields=profile_picture_url`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const profilePayload = (await profileResponse.json()) as {
      data?: Array<{ profile_picture_url?: string }>;
    };
    const profilePictureUrl = profilePayload.data?.[0]?.profile_picture_url;
    let logoUrl: string | null = null;

    // Meta's profile picture URL can be protected by the tenant's access token
    // and may expire. Fetch it server-side so both device previews can reuse a
    // stable browser-safe image without exposing WhatsApp credentials.
    if (profilePictureUrl) {
      let imageResponse = await fetch(profilePictureUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!imageResponse.ok) {
        imageResponse = await fetch(profilePictureUrl);
      }
      if (imageResponse.ok) {
        const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
        if (contentType.startsWith("image/")) {
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          logoUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;
        }
      }
    }

    res.json({
      businessName: phone?.verified_name ?? null,
      logoUrl,
      phoneNumber: phone?.display_phone_number ?? null,
      phoneNumberId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch the Meta business profile";
    if (message === "WhatsApp is not connected for this account") {
      res.status(409).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;