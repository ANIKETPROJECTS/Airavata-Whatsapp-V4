/**
 * Module 7: Live Chat — Conversations & Messages
 * Returns real conversation data from MongoDB and lets agents reply.
 */

import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { MessageModel } from "../models/Message";
import { ContactModel } from "../models/Contact";
import { sendTextMessage, uploadMedia, sendMediaMessage, mediaTypeFromMime } from "../lib/whatsapp";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB — Meta's limit
});

const router = Router();

// ── GET /api/conversations
// Returns all conversations for the logged-in user (latest message per contact)

router.get("/conversations", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);

    // Aggregate: group messages by contactId, pick the latest message per contact
    const convs = await MessageModel.aggregate([
      { $match: { userId } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$contactId",
          lastMessage: { $first: "$body" },
          lastMessageAt: { $first: "$createdAt" },
          lastDirection: { $first: "$direction" },
          unread: {
            $sum: {
              $cond: [{ $eq: ["$direction", "INBOUND"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      {
        $lookup: {
          from: "contacts",
          localField: "_id",
          foreignField: "_id",
          as: "contact",
        },
      },
      { $unwind: "$contact" },
    ]);

    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    // Compute windowOpen: last INBOUND message within 24 hours
    const windowMap = await MessageModel.aggregate([
      { $match: { userId, direction: "INBOUND" } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$contactId", lastInboundAt: { $first: "$createdAt" } } },
    ]);
    const windowByContact = new Map(
      windowMap.map((w) => [String(w._id), w.lastInboundAt as Date]),
    );

    const shaped = convs.map((c) => {
      const lastInbound = windowByContact.get(String(c._id));
      const windowOpen = lastInbound
        ? now - new Date(lastInbound).getTime() < twentyFourHours
        : false;

      return {
        id: String(c._id),
        contactId: String(c._id),
        contactName: c.contact.name ?? "Unknown",
        contactPhone: c.contact.phone ?? "",
        lastMessage: c.lastMessage ?? "",
        lastMessageAt: c.lastMessageAt,
        unread: c.unread ?? 0,
        status: "Open",
        windowOpen,
      };
    });

    res.json({ conversations: shaped });
  } catch (err: unknown) {
    logger.error({ err }, "GET /conversations failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/conversations/:contactId/messages
// Returns paginated message history for a specific contact

router.get("/conversations/:contactId/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const contactId = new mongoose.Types.ObjectId(req.params.contactId);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined; // ISO timestamp for pagination

    const filter: Record<string, unknown> = { userId, contactId };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await MessageModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const shaped = messages.reverse().map((m) => ({
      id: String(m._id),
      direction: m.direction,
      body: m.body ?? "",
      mediaType: m.mediaType ?? null,
      mediaFilename: m.mediaFilename ?? null,
      status: m.status,
      whatsappMessageId: m.whatsappMessageId,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      createdAt: m.createdAt,
    }));

    res.json({ messages: shaped });
  } catch (err: unknown) {
    logger.error({ err }, "GET /conversations/:contactId/messages failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/conversations/:contactId/messages
// Send a free-text reply (only valid within 24-hour customer service window)

router.post("/conversations/:contactId/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const contactId = new mongoose.Types.ObjectId(req.params.contactId);
    const { body } = req.body as { body: string };

    if (!body?.trim()) {
      return res.status(400).json({ error: "body is required" });
    }

    const contact = await ContactModel.findOne({ _id: contactId, userId }).lean();
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    // Verify 24-hour window
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastInbound = await MessageModel.findOne({
      userId,
      contactId,
      direction: "INBOUND",
      createdAt: { $gte: twentyFourHoursAgo },
    });
    if (!lastInbound) {
      return res.status(400).json({
        error: "24-hour customer service window is closed. Use a template message instead.",
      });
    }

    // Send via WhatsApp API
    const result = await sendTextMessage(contact.phone, body.trim());
    const waMessageId = result.messages?.[0]?.id ?? null;

    const msg = await MessageModel.create({
      userId,
      contactId,
      direction: "OUTBOUND",
      body: body.trim(),
      whatsappMessageId: waMessageId,
      status: "SENT",
      sentAt: new Date(),
    });

    res.status(201).json({
      message: {
        id: String(msg._id),
        direction: "OUTBOUND",
        body: msg.body,
        status: msg.status,
        whatsappMessageId: msg.whatsappMessageId,
        createdAt: msg.createdAt,
      },
    });
  } catch (err: unknown) {
    logger.error({ err }, "POST /conversations/:contactId/messages failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/conversations/:contactId/media
// Upload and send a media message (image, document, video, audio)

router.post(
  "/conversations/:contactId/media",
  authenticate,
  upload.single("file"),
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);
      const contactId = new mongoose.Types.ObjectId(req.params.contactId);

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const contact = await ContactModel.findOne({ _id: contactId, userId }).lean();
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      // Verify 24-hour window
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const lastInbound = await MessageModel.findOne({
        userId,
        contactId,
        direction: "INBOUND",
        createdAt: { $gte: twentyFourHoursAgo },
      });
      if (!lastInbound) {
        return res.status(400).json({
          error: "24-hour customer service window is closed. Use a template message instead.",
        });
      }

      const { buffer, mimetype, originalname } = req.file;
      const type = mediaTypeFromMime(mimetype);

      // 1. Upload to Meta
      const mediaId = await uploadMedia(buffer, mimetype, originalname);

      // 2. Send via WhatsApp
      const result = await sendMediaMessage(contact.phone, mediaId, type, originalname);
      const waMessageId = result.messages?.[0]?.id ?? null;

      // 3. Persist to MongoDB
      const caption = (req.body as { caption?: string }).caption?.trim() ?? "";
      const msg = await MessageModel.create({
        userId,
        contactId,
        direction: "OUTBOUND",
        body: caption || originalname,
        mediaType: type,
        mediaId,
        mediaFilename: originalname,
        whatsappMessageId: waMessageId,
        status: "SENT",
        sentAt: new Date(),
      });

      res.status(201).json({
        message: {
          id: String(msg._id),
          direction: "OUTBOUND",
          body: msg.body,
          mediaType: type,
          mediaFilename: originalname,
          status: msg.status,
          whatsappMessageId: msg.whatsappMessageId,
          createdAt: msg.createdAt,
        },
      });
    } catch (err: unknown) {
      logger.error({ err }, "POST /conversations/:contactId/media failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },
);

export default router;
