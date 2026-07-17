/**
 * Meta Compliance Endpoints
 *
 * These two endpoints are required by Meta to publish a Facebook app:
 *
 * 1. POST /api/auth/deauthorize
 *    Called by Meta when a user removes your app from their Facebook account.
 *    Enter this URL in Meta App Dashboard → Facebook Login for Business → Settings
 *    → Deauthorize Callback URL.
 *
 * 2. POST /api/auth/data-deletion
 *    Called by Meta when a user requests deletion of their data.
 *    Enter this URL in Meta App Dashboard → Facebook Login for Business → Settings
 *    → Data Deletion Request URL.
 *    Meta requires a JSON response with a `url` (status page) and `confirmation_code`.
 */

import { Router } from "express";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse and verify a Meta signed_request.
 * Returns the decoded payload object, or null if invalid/unsigned.
 */
function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): Record<string, unknown> | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;

  const [encodedSig, encodedPayload] = parts as [string, string];

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest("base64url");

  if (
    !crypto.timingSafeEqual(
      Buffer.from(encodedSig),
      Buffer.from(expectedSig),
    )
  ) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── POST /api/auth/deauthorize ────────────────────────────────────────────────

router.post("/auth/deauthorize", (req, res) => {
  const signedRequest = (req.body as Record<string, unknown>)
    ?.signed_request as string | undefined;

  if (!signedRequest) {
    logger.warn("Deauthorize callback received without signed_request");
    res.status(400).json({ error: "Missing signed_request" });
    return;
  }

  const appSecret = process.env.META_APP_SECRET;

  if (appSecret) {
    const payload = parseSignedRequest(signedRequest, appSecret);
    if (!payload) {
      logger.warn("Deauthorize callback: invalid signed_request signature");
      res.status(403).json({ error: "Invalid signed_request" });
      return;
    }
    logger.info(
      { userId: payload.user_id },
      "Meta deauthorize callback received — user removed app",
    );
  } else {
    // META_APP_SECRET not set — log a warning but still acknowledge
    logger.warn(
      "META_APP_SECRET not set; skipping signed_request verification for deauthorize callback",
    );
  }

  // Acknowledge with 200 — Meta expects this
  res.status(200).json({ ok: true });
});

// ── POST /api/auth/data-deletion ──────────────────────────────────────────────

router.post("/auth/data-deletion", (req, res) => {
  const signedRequest = (req.body as Record<string, unknown>)
    ?.signed_request as string | undefined;

  if (!signedRequest) {
    logger.warn("Data deletion callback received without signed_request");
    res.status(400).json({ error: "Missing signed_request" });
    return;
  }

  const appSecret = process.env.META_APP_SECRET;
  let userId: unknown = "unknown";

  if (appSecret) {
    const payload = parseSignedRequest(signedRequest, appSecret);
    if (!payload) {
      logger.warn(
        "Data deletion callback: invalid signed_request signature",
      );
      res.status(403).json({ error: "Invalid signed_request" });
      return;
    }
    userId = payload.user_id;
  } else {
    logger.warn(
      "META_APP_SECRET not set; skipping signed_request verification for data-deletion callback",
    );
  }

  // Generate a unique confirmation code for Meta's records
  const confirmationCode = crypto
    .randomBytes(16)
    .toString("hex");

  logger.info(
    { userId, confirmationCode },
    "Meta data deletion callback received",
  );

  // Meta requires this exact response shape:
  // { url: <status page URL>, confirmation_code: <unique string> }
  res.status(200).json({
    url: `https://airavataintelligence.com/privacy/deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

export default router;
