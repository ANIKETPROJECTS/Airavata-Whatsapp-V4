import { Router } from "express";
import mongoose from "mongoose";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { NotificationModel } from "../models/Notification";
import { TemplateModel } from "../models/Template";
import { CampaignModel } from "../models/Campaign";
import { MessageModel } from "../models/Message";

const router = Router();

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function syncActualNotifications(userId: string) {
  const [templates, failedCampaigns, failedMessages, inboundMessages] = await Promise.all([
    TemplateModel.find({ userId, status: { $in: ["PENDING", "REJECTED"] } })
      .select("_id name status rejectionReason updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    CampaignModel.find({ userId, status: "FAILED" })
      .select("_id name stats updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    MessageModel.find({ userId, direction: "OUTBOUND", status: "FAILED" })
      .select("_id body failureReason createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    MessageModel.find({ userId, direction: "INBOUND" })
      .select("_id body contactId createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const records = [
    ...templates.map((template) => ({
      userId,
      type: "TEMPLATE" as const,
      severity: template.status === "REJECTED" ? "ERROR" as const : "INFO" as const,
      title: template.status === "REJECTED" ? "Template rejected" : "Template awaiting approval",
      message: template.rejectionReason
        ? `${template.name}: ${template.rejectionReason}`
        : `${template.name} is awaiting WhatsApp approval.`,
      dedupeKey: `template:${template._id}:${template.status}`,
      actionUrl: "/manage-templates",
      metadata: { templateId: String(template._id), status: template.status },
      createdAt: template.updatedAt,
    })),
    ...failedCampaigns.map((campaign) => ({
      userId,
      type: "CAMPAIGN" as const,
      severity: "ERROR" as const,
      title: "Campaign failed",
      message: `${campaign.name} could not be completed. Review the campaign report.`,
      dedupeKey: `campaign:${campaign._id}:failed`,
      actionUrl: "/campaigns-report",
      metadata: { campaignId: String(campaign._id) },
      createdAt: campaign.updatedAt,
    })),
    ...failedMessages.map((message) => ({
      userId,
      type: "DELIVERY" as const,
      severity: "ERROR" as const,
      title: "Message delivery failed",
      message: message.failureReason || "A WhatsApp message could not be delivered.",
      dedupeKey: `message:${message._id}:failed`,
      actionUrl: "/live-chat",
      metadata: { messageId: String(message._id) },
      createdAt: message.createdAt,
    })),
    ...inboundMessages.map((message) => ({
      userId,
      type: "MESSAGE" as const,
      severity: "INFO" as const,
      title: "New customer message",
      message: message.body
        ? message.body.slice(0, 160)
        : "A customer sent a new WhatsApp message.",
      dedupeKey: `message:${message._id}:inbound`,
      actionUrl: "/live-chat",
      metadata: { messageId: String(message._id), contactId: String(message.contactId) },
      createdAt: message.createdAt,
    })),
  ];

  if (records.length > 0) {
    await NotificationModel.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { userId, dedupeKey: record.dedupeKey },
          update: { $setOnInsert: record },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}

router.get("/notifications", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await syncActualNotifications(userId);

    const search = String(req.query.search ?? "").trim();
    const type = String(req.query.type ?? "ALL").toUpperCase();
    const read = String(req.query.read ?? "ALL").toUpperCase();
    const sort = String(req.query.sort ?? "NEWEST").toUpperCase();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const filter: Record<string, unknown> = { userId };

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: regex }, { message: regex }];
    }
    if (["MESSAGE", "DELIVERY", "CAMPAIGN", "TEMPLATE", "SYSTEM"].includes(type)) {
      filter.type = type;
    }
    if (read === "UNREAD") filter.readAt = null;
    if (read === "READ") filter.readAt = { $ne: null };

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: sort === "OLDEST" ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({ userId, readAt: null }),
    ]);

    res.json({
      notifications: notifications.map((notification) => ({
        ...notification,
        id: String(notification._id),
        createdAt: notification.createdAt,
        read: Boolean(notification.readAt),
      })),
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    req.log?.error?.(error, "Unable to load notifications");
    res.status(500).json({ error: "Unable to load notifications" });
  }
});

router.patch("/notifications/:id/read", authenticate, async (req: AuthRequest, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid notification ID" });
      return;
    }
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean();
    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ notification: { ...notification, id: String(notification._id), read: true } });
  } catch {
    res.status(500).json({ error: "Unable to update notification" });
  }
});

router.post("/notifications/read-all", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await NotificationModel.updateMany(
      { userId: req.user!.userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ ok: true, updated: result.modifiedCount });
  } catch {
    res.status(500).json({ error: "Unable to mark notifications as read" });
  }
});

export default router;