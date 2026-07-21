/**
 * GET /api/media/proxy?mediaId=<Meta media object ID>
 *
 * Meta CDN URLs require an Authorization header that browsers cannot send.
 * This endpoint resolves the download URL from the media ID, fetches the
 * bytes server-side with the Bearer token, and streams them to the browser.
 */

import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const router = Router();

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

router.get("/media/proxy", authenticate, async (req, res) => {
  const mediaId = req.query.mediaId as string | undefined;

  if (!mediaId) {
    res.status(400).json({ error: "mediaId query param is required" });
    return;
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: "META_ACCESS_TOKEN is not configured" });
    return;
  }

  try {
    // Step 1: resolve the download URL + mime type from the media ID
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const text = await metaRes.text();
      logger.warn({ mediaId, status: metaRes.status, text }, "Meta media resolve failed");
      res.status(502).json({ error: `Meta returned ${metaRes.status}` });
      return;
    }

    const meta = await metaRes.json() as { url: string; mime_type: string; file_size?: number };

    // Step 2: fetch the actual bytes with the Bearer token
    const mediaRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mediaRes.ok) {
      logger.warn({ mediaId, status: mediaRes.status }, "Meta media download failed");
      res.status(502).json({ error: `Media download returned ${mediaRes.status}` });
      return;
    }

    // Stream back to browser with correct content type
    res.setHeader("Content-Type", meta.mime_type ?? "application/octet-stream");
    if (meta.file_size) res.setHeader("Content-Length", String(meta.file_size));
    // Cache for 1 hour — Meta CDN URLs are short-lived but the proxy URL is stable
    res.setHeader("Cache-Control", "private, max-age=3600");

    const reader = mediaRes.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: "Empty media body from Meta" });
      return;
    }

    res.on("close", () => reader.cancel());

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    logger.error({ err, mediaId }, "Media proxy error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Media proxy failed" });
    }
  }
});

export default router;
