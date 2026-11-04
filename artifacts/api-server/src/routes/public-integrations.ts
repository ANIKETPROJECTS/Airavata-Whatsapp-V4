import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  ListPublicWhatsAppTemplatesQueryParams,
  ListPublicWhatsAppTemplatesResponse,
  SendPublicWhatsAppTemplateMessageBody,
  SendPublicWhatsAppTemplateMessageResponse,
  SendPublicWhatsAppTextMessageBody,
  SendPublicWhatsAppTextMessageResponse,
} from "@workspace/api-zod";
import { ApiKeyModel } from "../models/ApiKey";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { TemplateModel } from "../models/Template";
import { UserModel } from "../models/User";
import { authenticateAutoGammaRequest } from "../lib/apiKeyAuth";
import { InsufficientCreditsError, withCreditCharge } from "../lib/creditDeduction";
import { findOrCreateContactForPhone } from "../lib/liveChatPersistence";
import { getCredentials, sendTemplateMessage, sendTextMessage } from "../lib/whatsapp";
import { getTemplateMessageMediaFields } from "../lib/templateComponents";
import { normalizeContactPhone } from "../lib/contactPhone";
import { runWithTenant } from "../lib/tenantDatabase";
import { logger } from "../lib/logger";
import { deriveConversationTabState } from "../lib/conversationTabState";
import { buildConversationActivityMatch } from "../lib/conversationActivityQuery";

const router = Router();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function authenticatePublicRequest(
  req: Request,
  res: Response,
  phoneNumberId: string,
): Promise<string | null> {
  try {
    const result = await authenticateAutoGammaRequest(
      phoneNumberId,
      req.headers.authorization,
      {
        findOwnerByPhoneNumberId: async (id) => {
          const owner = await UserModel.findOne({
            metaPhoneNumberId: id,
            active: { $ne: false },
          })
            .select("_id")
            .lean();
          return owner ? { id: String(owner._id) } : null;
        },
        runWithTenant,
        findActiveApiKeyCandidates: async (ownerId, keyPrefix) =>
          ApiKeyModel.find({
            userId: new mongoose.Types.ObjectId(ownerId),
            keyPrefix,
            revokedAt: { $exists: false },
          })
            .select("_id keyHash")
            .lean(),
        compareApiKey: bcrypt.compare,
        markApiKeyUsed: async (ownerId, keyId) => {
          await ApiKeyModel.updateOne(
            {
              _id: keyId,
              userId: new mongoose.Types.ObjectId(ownerId),
            },
            { $set: { lastUsedAt: new Date() } },
          );
        },
        getCredentialPhoneNumberId: async (ownerId) =>
          (await getCredentials(ownerId, { allowEnvFallback: false })).phoneNumberId,
      },
    );

    if (result.kind === "unauthorized") {
      res.status(401).json({ error: "Invalid API key or WhatsApp phone-number mapping" });
      return null;
    }
    if (result.kind === "mapping_conflict") {
      res.status(409).json({ error: "Phone number ID does not match this tenant's WhatsApp account" });
      return null;
    }
    return result.userId;
  } catch (error) {
    logger.error({ err: error }, "Public integration API authentication failed");
    res.status(500).json({ error: "Unable to authenticate this integration request" });
    return null;
  }
}

type StoredMessage = {
  _id: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  body?: string;
  externalRequestHash?: string;
  whatsappMessageId?: string | null;
  status: string;
};

async function reserveMessage(input: {
  userId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  clientMessageId: string;
  requestHash: string;
  body: string;
  templateId?: mongoose.Types.ObjectId;
}): Promise<{ message: StoredMessage; duplicate: boolean; conflict: boolean }> {
  const externalMessageId = `airavata-api:${input.clientMessageId}`;
  const existing = await MessageModel.findOne({
    userId: input.userId,
    externalMessageId,
  }).lean();

  if (existing) {
    const sameRequest =
      String(existing.contactId) === String(input.contactId) &&
      (existing.body ?? "") === input.body &&
      String(existing.templateId ?? "") === String(input.templateId ?? "") &&
      existing.externalRequestHash === input.requestHash;
    return {
      message: existing as StoredMessage,
      duplicate: true,
      conflict: !sameRequest,
    };
  }

  try {
    const message = await MessageModel.create({
      userId: input.userId,
      contactId: input.contactId,
      externalMessageId,
      externalRequestHash: input.requestHash,
      ...(input.templateId ? { templateId: input.templateId } : {}),
      direction: "OUTBOUND",
      body: input.body,
      status: "QUEUED",
    });
    return { message: message.toObject() as StoredMessage, duplicate: false, conflict: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await MessageModel.findOne({
      userId: input.userId,
      externalMessageId,
    }).lean();
    if (!raced) throw error;
    const sameRequest =
      String(raced.contactId) === String(input.contactId) &&
      (raced.body ?? "") === input.body &&
      String(raced.templateId ?? "") === String(input.templateId ?? "") &&
      raced.externalRequestHash === input.requestHash;
    return {
      message: raced as StoredMessage,
      duplicate: true,
      conflict: !sameRequest,
    };
  }
}

function messageResult(
  message: StoredMessage,
  duplicate: boolean,
) {
  return {
    ok: true,
    duplicate,
    messageId: String(message._id),
    contactId: String(message.contactId),
    whatsappMessageId: message.whatsappMessageId ?? null,
    status: message.status,
  };
}

function parseListLimit(value: unknown, fallback = 50): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 100 ? parsed : null;
}

function parseCursorDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/integrations/v1/whatsapp/conversations", async (req, res): Promise<void> => {
  const phoneNumberId = typeof req.query.phoneNumberId === "string" ? req.query.phoneNumberId : "";
  if (!/^\d+$/.test(phoneNumberId)) {
    res.status(400).json({ error: "A valid phoneNumberId query parameter is required" });
    return;
  }
  const limit = parseListLimit(req.query.limit);
  const before = parseCursorDate(req.query.before);
  const rawStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const status = rawStatus === "SENT" || rawStatus === "OPEN" || rawStatus === "CLOSED"
    ? rawStatus
    : rawStatus === undefined || rawStatus === "ALL"
      ? undefined
      : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  if (limit === null || before === null || status === null) {
    res.status(400).json({ error: "Invalid limit, before cursor, or status filter" });
    return;
  }

  const userId = await authenticatePublicRequest(req, res, phoneNumberId);
  if (!userId) return;

  try {
    const result = await runWithTenant(userId, async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const convs = await MessageModel.aggregate([
        { $match: { userId: userObjectId } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$contactId",
            lastMessage: { $first: "$body" },
            lastMessageAt: { $first: "$createdAt" },
            lastDirection: { $first: "$direction" },
          },
        },
        {
          $lookup: {
            from: "contacts",
            localField: "_id",
            foreignField: "_id",
            as: "contact",
          },
        },
        { $unwind: "$contact" },
        { $sort: { lastMessageAt: -1, _id: -1 } },
      ]);

      const unreadRows = await MessageModel.aggregate([
        { $match: { userId: userObjectId, direction: "INBOUND" } },
        {
          $lookup: {
            from: "contacts",
            localField: "contactId",
            foreignField: "_id",
            as: "contact",
          },
        },
        { $unwind: "$contact" },
        {
          $match: {
            $expr: {
              $gt: ["$createdAt", { $ifNull: ["$contact.lastReadAt", new Date(0)] }],
            },
          },
        },
        { $group: { _id: "$contactId", unread: { $sum: 1 } } },
      ]);
      const unreadByContact = new Map(
        unreadRows.map((row) => [String(row._id), Number(row.unread ?? 0)]),
      );

      const activityRows = await MessageModel.aggregate([
        { $match: buildConversationActivityMatch(userObjectId) },
        {
          $group: {
            _id: "$contactId",
            lastInboundAt: {
              $max: {
                $cond: [{ $eq: ["$direction", "INBOUND"] }, "$createdAt", null],
              },
            },
            lastTemplateSentAt: {
              $max: {
                $cond: [
                  { $eq: ["$direction", "OUTBOUND"] },
                  { $ifNull: ["$sentAt", "$createdAt"] },
                  null,
                ],
              },
            },
          },
        },
      ]);
      const activityByContact = new Map(
        activityRows.map((row) => [
          String(row._id),
          {
            lastInboundAt: row.lastInboundAt as Date | null,
            lastTemplateSentAt: row.lastTemplateSentAt as Date | null,
          },
        ]),
      );

      const now = Date.now();
      const searchPattern = search ? new RegExp(escapeRegExp(search), "i") : null;
      const shaped = convs.map((conversation) => {
        const contact = conversation.contact;
        const activity = activityByContact.get(String(conversation._id));
        const lastInboundAt = activity?.lastInboundAt ?? null;
        const lastTemplateSentAt = activity?.lastTemplateSentAt ?? null;
        const tabState = deriveConversationTabState(
          lastInboundAt ? new Date(lastInboundAt).getTime() : null,
          lastTemplateSentAt ? new Date(lastTemplateSentAt).getTime() : null,
          now,
          contact.chatState === "CLOSED",
        );
        const conversationStatus =
          tabState === "SENT"
            ? "Sent"
            : tabState === "OPEN"
              ? "Open"
              : tabState === "CLOSED"
                ? "Closed"
                : contact.chatState === "CLOSED"
                  ? "Closed"
                  : "Open";
        const contactName =
          contact.name && contact.name !== contact.phone ? contact.name : "Unnamed contact";
        return {
          id: String(conversation._id),
          contactId: String(conversation._id),
          contactName,
          contactPhone: contact.phone ?? "",
          lastMessage: conversation.lastMessage ?? "",
          lastMessageDirection: conversation.lastDirection ?? null,
          lastMessageAt: conversation.lastMessageAt,
          lastInboundAt,
          unread: unreadByContact.get(String(conversation._id)) ?? 0,
          status: conversationStatus,
          windowOpen: lastInboundAt
            ? now - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000
            : false,
        };
      }).filter((conversation) => {
        if (status && conversation.status.toUpperCase() !== status) return false;
        if (before && new Date(conversation.lastMessageAt).getTime() >= before.getTime()) return false;
        if (
          searchPattern &&
          !searchPattern.test(conversation.contactName) &&
          !searchPattern.test(conversation.contactPhone) &&
          !searchPattern.test(conversation.lastMessage)
        ) return false;
        return true;
      });

      const page = shaped.slice(0, limit);
      return {
        conversations: page,
        nextBefore:
          shaped.length > limit && page.length > 0
            ? new Date(page[page.length - 1]!.lastMessageAt).toISOString()
            : null,
      };
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    logger.error({ err: error, phoneNumberId }, "Unable to list public WhatsApp conversations");
    res.status(500).json({ error: "Unable to load conversations" });
  }
});

router.get(
  "/integrations/v1/whatsapp/conversations/:contactId/messages",
  async (req, res): Promise<void> => {
    const phoneNumberId = typeof req.query.phoneNumberId === "string" ? req.query.phoneNumberId : "";
    if (!/^\d+$/.test(phoneNumberId)) {
      res.status(400).json({ error: "A valid phoneNumberId query parameter is required" });
      return;
    }
    if (!mongoose.isValidObjectId(req.params.contactId)) {
      res.status(400).json({ error: "A valid contactId path parameter is required" });
      return;
    }
    const limit = parseListLimit(req.query.limit);
    const before = parseCursorDate(req.query.before);
    if (limit === null || before === null) {
      res.status(400).json({ error: "Invalid limit or before cursor" });
      return;
    }

    const userId = await authenticatePublicRequest(req, res, phoneNumberId);
    if (!userId) return;

    try {
      const result = await runWithTenant(userId, async () => {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const contactId = new mongoose.Types.ObjectId(req.params.contactId);
        const contact = await ContactModel.findOne({ _id: contactId, userId: userObjectId })
          .select("_id name phone")
          .lean();
        if (!contact) return null;

        const filter: Record<string, unknown> = { userId: userObjectId, contactId };
        if (before) filter.createdAt = { $lt: before };
        const rows = await MessageModel.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit + 1)
          .lean();
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit).reverse();
        return {
          contact: {
            id: String(contact._id),
            name: contact.name && contact.name !== contact.phone ? contact.name : "Unnamed contact",
            phone: contact.phone,
          },
          messages: page.map((message) => ({
            id: String(message._id),
            direction: message.direction,
            body: message.body ?? "",
            type: message.mediaType ? "media" : "text",
            mediaType: message.mediaType ?? null,
            mediaId: message.mediaId ?? null,
            mediaUrl: message.mediaUrl ?? null,
            mediaFilename: message.mediaFilename ?? null,
            flowData: message.flowData ?? null,
            flowId: message.flowId ? String(message.flowId) : null,
            status: message.status,
            failureReason: message.failureReason ?? null,
            whatsappMessageId: message.whatsappMessageId ?? null,
            sentAt: message.sentAt ?? null,
            deliveredAt: message.deliveredAt ?? null,
            readAt: message.readAt ?? null,
            createdAt: message.createdAt,
          })),
          nextBefore:
            hasMore && page.length > 0
              ? new Date(page[0]!.createdAt).toISOString()
              : null,
        };
      });
      if (!result) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      logger.error(
        { err: error, phoneNumberId, contactId: req.params.contactId },
        "Unable to load public WhatsApp conversation messages",
      );
      res.status(500).json({ error: "Unable to load conversation messages" });
    }
  },
);

async function markMessageFailed(
  userId: mongoose.Types.ObjectId,
  messageId: mongoose.Types.ObjectId,
  error: unknown,
): Promise<void> {
  await MessageModel.updateOne(
    { _id: messageId, userId, status: "QUEUED" },
    {
      $set: {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message.slice(0, 500) : "WhatsApp send failed",
      },
    },
  );
}

router.get("/integrations/v1/whatsapp/templates", async (req, res): Promise<void> => {
  const query = ListPublicWhatsAppTemplatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "A valid phoneNumberId query parameter is required" });
    return;
  }

  const userId = await authenticatePublicRequest(req, res, query.data.phoneNumberId);
  if (!userId) return;

  try {
    const templates = await runWithTenant(userId, async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const rows = await TemplateModel.find({
        userId: userObjectId,
        status: "APPROVED",
      })
        .select("name language category body metaComponents")
        .sort({ name: 1, language: 1 })
        .lean();

      return rows.map((template) => ({
        name: template.name,
        language: template.language ?? "en_US",
        category: template.category,
        body: template.body,
        components: Array.isArray(template.metaComponents)
          ? template.metaComponents.filter(
              (component): component is Record<string, unknown> =>
                typeof component === "object" && component !== null && !Array.isArray(component),
            )
          : [],
      }));
    });

    res.json(ListPublicWhatsAppTemplatesResponse.parse({ templates }));
  } catch (error) {
    logger.error({ err: error }, "Unable to list public WhatsApp templates");
    res.status(500).json({ error: "Unable to load approved templates" });
  }
});

router.post("/integrations/v1/whatsapp/messages/text", async (req, res): Promise<void> => {
  const parsed = SendPublicWhatsAppTextMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid text-message request" });
    return;
  }
  const payload = parsed.data;
  const text = payload.text.trim();
  if (!text) {
    res.status(400).json({ error: "text must not be blank" });
    return;
  }

  let recipientPhone: string;
  try {
    recipientPhone = normalizeContactPhone(payload.to);
  } catch {
    res.status(400).json({ error: "to must be a valid international phone number" });
    return;
  }

  const userId = await authenticatePublicRequest(req, res, payload.phoneNumberId);
  if (!userId) return;

  try {
    const result = await runWithTenant(userId, async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const contact = await ContactModel.findOne({
        userId: userObjectId,
        phone: recipientPhone,
      })
        .select("_id status")
        .lean();

      if (!contact) {
        return { error: "The 24-hour service window is closed. Send an approved template first." as const, status: 422 };
      }
      if (contact.status !== "active") {
        return { error: `This contact is ${contact.status} and cannot receive messages.` as const, status: 422 };
      }

      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentInbound = await MessageModel.exists({
        userId: userObjectId,
        contactId: contact._id,
        direction: "INBOUND",
        createdAt: { $gte: windowStart },
      });
      if (!recentInbound) {
        return { error: "The 24-hour service window is closed. Send an approved template instead." as const, status: 422 };
      }

      const reservation = await reserveMessage({
        userId: userObjectId,
        contactId: contact._id,
        clientMessageId: payload.clientMessageId,
        requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
        body: text,
      });
      if (reservation.conflict) {
        return { error: "clientMessageId has already been used for a different request." as const, status: 409 };
      }
      if (reservation.duplicate) {
        return {
          response: SendPublicWhatsAppTextMessageResponse.parse(
            messageResult(reservation.message, true),
          ),
          status: 200,
        };
      }

      try {
        const result = await withCreditCharge({
          userId: userObjectId,
          description: `Developer API session message`,
          send: () => sendTextMessage(recipientPhone, text, userId),
        });
        const whatsappMessageId = result.messages?.[0]?.id;
        if (!whatsappMessageId) throw new Error("WhatsApp did not return a message ID");

        await MessageModel.updateOne(
          { _id: reservation.message._id, userId: userObjectId },
          {
            $set: {
              whatsappMessageId,
              status: "SENT",
              sentAt: new Date(),
            },
          },
        );
        await ContactModel.updateOne(
          { _id: contact._id, userId: userObjectId },
          { $max: { lastContactedAt: new Date() } },
        );

        const saved = await MessageModel.findById(reservation.message._id).lean();
        if (!saved) throw new Error("Sent message could not be loaded");
        return {
          response: SendPublicWhatsAppTextMessageResponse.parse(
            messageResult(saved as StoredMessage, false),
          ),
          status: 201,
        };
      } catch (error) {
        await markMessageFailed(userObjectId, reservation.message._id, error);
        throw error;
      }
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json(result.response);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      res.status(402).json({ error: error.message });
      return;
    }
    logger.error({ err: error, phoneNumberId: payload.phoneNumberId }, "Public text message send failed");
    res.status(502).json({ error: "WhatsApp could not accept the message. Check the connected account and request." });
  }
});

router.post("/integrations/v1/whatsapp/messages/template", async (req, res): Promise<void> => {
  const parsed = SendPublicWhatsAppTemplateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid template-message request" });
    return;
  }
  const payload = parsed.data;

  let recipientPhone: string;
  try {
    recipientPhone = normalizeContactPhone(payload.to);
  } catch {
    res.status(400).json({ error: "to must be a valid international phone number" });
    return;
  }

  const userId = await authenticatePublicRequest(req, res, payload.phoneNumberId);
  if (!userId) return;

  try {
    const result = await runWithTenant(userId, async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const template = await TemplateModel.findOne({
        userId: userObjectId,
        name: payload.templateName.trim(),
        language: payload.languageCode,
        status: "APPROVED",
      })
        .select("_id name language category body")
        .lean();

      if (!template) {
        return { error: "Approved template not found for this name and language." as const, status: 404 };
      }

      let contact = await ContactModel.findOne({
        userId: userObjectId,
        phone: recipientPhone,
      })
        .select("_id status")
        .lean();

      if (!contact) {
        const created = await findOrCreateContactForPhone(userObjectId, recipientPhone, {
          enrollInTriggerCampaigns: false,
          emitContactCreatedEvent: false,
        });
        contact = await ContactModel.findOne({
          _id: new mongoose.Types.ObjectId(created.contactId),
          userId: userObjectId,
        })
          .select("_id status")
          .lean();
      }

      if (!contact) {
        throw new Error("Contact could not be created for this recipient");
      }
      if (contact.status !== "active") {
        return { error: `This contact is ${contact.status} and cannot receive messages.` as const, status: 422 };
      }

      const templateId = new mongoose.Types.ObjectId(String(template._id));
      const reservation = await reserveMessage({
        userId: userObjectId,
        contactId: contact._id,
        clientMessageId: payload.clientMessageId,
        requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
        body: template.body,
        templateId,
      });
      if (reservation.conflict) {
        return { error: "clientMessageId has already been used for a different request." as const, status: 409 };
      }
      if (reservation.duplicate) {
        return {
          response: SendPublicWhatsAppTemplateMessageResponse.parse(
            messageResult(reservation.message, true),
          ),
          status: 200,
        };
      }

      try {
        const components = payload.components as Array<Record<string, unknown>> | undefined;
        const sendResult = await withCreditCharge({
          userId: userObjectId,
          category: template.category,
          description: `Developer API ${template.category} template message`,
          send: () =>
            sendTemplateMessage(
              recipientPhone,
              template.name,
              template.language ?? "en_US",
              components,
              userId,
            ),
        });
        const whatsappMessageId = sendResult.messages?.[0]?.id;
        if (!whatsappMessageId) throw new Error("WhatsApp did not return a message ID");

        await MessageModel.updateOne(
          { _id: reservation.message._id, userId: userObjectId },
          {
            $set: {
              whatsappMessageId,
              status: "SENT",
              sentAt: new Date(),
              ...getTemplateMessageMediaFields(components),
            },
          },
        );
        await ContactModel.updateOne(
          { _id: contact._id, userId: userObjectId },
          { $max: { lastContactedAt: new Date() } },
        );

        const saved = await MessageModel.findById(reservation.message._id).lean();
        if (!saved) throw new Error("Sent message could not be loaded");
        return {
          response: SendPublicWhatsAppTemplateMessageResponse.parse(
            messageResult(saved as StoredMessage, false),
          ),
          status: 201,
        };
      } catch (error) {
        await markMessageFailed(userObjectId, reservation.message._id, error);
        throw error;
      }
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.status).json(result.response);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      res.status(402).json({ error: error.message });
      return;
    }
    logger.error({ err: error, phoneNumberId: payload.phoneNumberId }, "Public template message send failed");
    res.status(502).json({ error: "WhatsApp could not accept the message. Check the connected account and request." });
  }
});

export default router;