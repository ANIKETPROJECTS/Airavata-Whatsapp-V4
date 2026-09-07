import { randomBytes } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { CLIENT_WEBHOOK_EVENTS, WebhookModel } from "../models/Webhook";

const router = Router();
router.use(authenticate);

function serializeWebhook(webhook: {
  _id: unknown;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(webhook._id),
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

function validateUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function validateEvents(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const events = [...new Set(value.filter((event): event is string => typeof event === "string"))];
  if (
    events.length === 0 ||
    events.some((event) => !(CLIENT_WEBHOOK_EVENTS as readonly string[]).includes(event))
  ) {
    return null;
  }
  return events;
}

router.get("/webhooks", async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const webhooks = await WebhookModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      webhooks: webhooks.map((webhook) => serializeWebhook(webhook)),
    });
  } catch {
    res.status(500).json({ error: "Unable to load webhooks" });
  }
});

router.post("/webhooks", async (req: AuthRequest, res) => {
  try {
    const url = validateUrl(req.body?.url);
    const events = validateEvents(req.body?.events);
    if (!url) return res.status(400).json({ error: "A valid HTTP or HTTPS URL is required" });
    if (!events) return res.status(400).json({ error: "At least one valid webhook event is required" });

    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const secret = randomBytes(32).toString("hex");
    const webhook = await WebhookModel.create({
      userId,
      url,
      events,
      isActive: true,
      secret,
    });

    res.status(201).json({
      webhook: {
        ...serializeWebhook(webhook),
        // The signing secret is shown only on creation.
        secret,
      },
    });
  } catch {
    res.status(500).json({ error: "Unable to create webhook" });
  }
});

router.delete("/webhooks/:id", async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid webhook ID" });
    }
    const deleted = await WebhookModel.deleteOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId,
    });
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Unable to delete webhook" });
  }
});

export default router;