import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  IngestAutoGammaOutboundMessageBody,
  IngestAutoGammaOutboundMessageResponse,
} from "@workspace/api-zod";
import { ApiKeyModel } from "../models/ApiKey";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { UserModel } from "../models/User";
import { getCredentials } from "../lib/whatsapp";
import { authenticateAutoGammaRequest } from "../lib/apiKeyAuth";
import {
  persistExternalOutboundMessage,
  type ExternalOutboundMessageStore,
} from "../lib/externalOutboundMessagePersistence";
import {
  findContactIdForPhone,
  findOrCreateContactForPhone,
} from "../lib/liveChatPersistence";
import { runWithTenant } from "../lib/tenantDatabase";
import { normalizeContactPhone } from "../lib/contactPhone";
import { logger } from "../lib/logger";

const router = Router();

router.post("/integrations/autogamma/outbound-messages", async (req, res): Promise<void> => {
  const parsed = IngestAutoGammaOutboundMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid outbound message payload" });
    return;
  }

  const payload = parsed.data;
  if (!/^\d+$/.test(payload.phoneNumberId) || /\s/.test(payload.whatsappMessageId)) {
    res.status(400).json({ error: "Invalid WhatsApp phone-number or message ID" });
    return;
  }

  let recipientPhone: string;
  try {
    recipientPhone = normalizeContactPhone(payload.recipientPhone);
  } catch {
    res.status(400).json({ error: "recipientPhone must be a valid international phone number" });
    return;
  }

  if (payload.media?.url) {
    try {
      const mediaUrl = new URL(payload.media.url);
      if (mediaUrl.protocol !== "https:" || mediaUrl.username || mediaUrl.password) {
        throw new Error("HTTPS URL required");
      }
    } catch {
      res.status(400).json({ error: "media.url must be a valid HTTPS URL" });
      return;
    }
  }

  try {
    const authentication = await authenticateAutoGammaRequest(
      payload.phoneNumberId,
      req.headers.authorization,
      {
        findOwnerByPhoneNumberId: async (phoneNumberId) => {
          const owner = await UserModel.findOne({
            metaPhoneNumberId: phoneNumberId,
            active: { $ne: false },
          })
            .select("_id")
            .lean();
          return owner ? { id: String(owner._id) } : null;
        },
        runWithTenant,
        findActiveApiKeyCandidates: async (ownerId, keyPrefix) => {
          const userId = new mongoose.Types.ObjectId(ownerId);
          return ApiKeyModel.find({
            userId,
            keyPrefix,
            revokedAt: { $exists: false },
          })
            .select("_id keyHash")
            .lean();
        },
        compareApiKey: bcrypt.compare,
        markApiKeyUsed: async (ownerId, keyId) => {
          await ApiKeyModel.updateOne(
            { _id: keyId, userId: new mongoose.Types.ObjectId(ownerId) },
            { $set: { lastUsedAt: new Date() } },
          );
        },
        getCredentialPhoneNumberId: async (ownerId) =>
          (await getCredentials(ownerId, { allowEnvFallback: false })).phoneNumberId,
      },
    );

    if (authentication.kind === "unauthorized") {
      res.status(401).json({ error: "Invalid API key or WhatsApp phone-number mapping" });
      return;
    }
    if (authentication.kind === "mapping_conflict") {
      res.status(409).json({ error: "WhatsApp phone-number mapping does not match this tenant" });
      return;
    }

    const userId = new mongoose.Types.ObjectId(authentication.userId);
    const persisted = await runWithTenant(authentication.userId, async () => {
      const store: ExternalOutboundMessageStore = {
        findMessageByWhatsAppId: async (whatsappMessageId) => {
          const message = await MessageModel.findOne({
            userId,
            $or: [
              { whatsappMessageId },
              { externalMessageId: whatsappMessageId },
            ],
          })
            .select("_id contactId status")
            .lean();
          if (!message) return null;
          return {
            id: String(message._id),
            contactId: String(message.contactId),
            status: message.status,
          };
        },
        findContactByPhone: async (phone) => {
          const contactId = await findContactIdForPhone(userId, phone);
          return contactId ? { id: contactId } : null;
        },
        createContact: async (phone) => {
          const contact = await findOrCreateContactForPhone(userId, phone, {
            // Recording an external send must not trigger a second WhatsApp send
            // or echo a contact-created event back to the sending integration.
            enrollInTriggerCampaigns: false,
            emitContactCreatedEvent: false,
          });
          return {
            contact: { id: contact.contactId },
            created: contact.created,
          };
        },
        createOutboundMessage: async (message) => {
          const contactId = new mongoose.Types.ObjectId(message.contactId);
          const createdMessage = await MessageModel.create({
            userId,
            contactId,
            externalMessageId: message.externalMessageId,
            whatsappMessageId: message.whatsappMessageId,
            direction: message.direction,
            status: message.status,
            body: message.body,
            sentAt: message.sentAt,
            ...(message.mediaType ? { mediaType: message.mediaType } : {}),
            ...(message.mediaUrl ? { mediaUrl: message.mediaUrl } : {}),
            ...(message.mediaId ? { mediaId: message.mediaId } : {}),
            ...(message.mediaFilename ? { mediaFilename: message.mediaFilename } : {}),
          });
          await ContactModel.updateOne(
            { _id: contactId, userId },
            { $max: { lastContactedAt: message.sentAt } },
          );
          return {
            id: String(createdMessage._id),
            contactId: String(contactId),
            status: createdMessage.status,
          };
        },
      };

      return persistExternalOutboundMessage(
        {
          whatsappMessageId: payload.whatsappMessageId,
          recipientPhone,
          body: payload.body,
          sentAt: payload.sentAt ?? new Date(),
          ...(payload.media
            ? {
                mediaType: payload.media.type,
                ...(payload.media.url ? { mediaUrl: payload.media.url } : {}),
                ...(payload.media.id ? { mediaId: payload.media.id } : {}),
                ...(payload.media.filename ? { mediaFilename: payload.media.filename } : {}),
              }
            : {}),
        },
        store,
      );
    });

    const response = IngestAutoGammaOutboundMessageResponse.parse({
      ok: true,
      created: persisted.created,
      contactId: persisted.message.contactId,
      messageId: persisted.message.id,
      whatsappMessageId: payload.whatsappMessageId,
    });
    res.status(persisted.created ? 201 : 200).json(response);
  } catch (error) {
    logger.error(
      {
        err: error,
        phoneNumberId: payload.phoneNumberId,
        whatsappMessageId: payload.whatsappMessageId,
      },
      "AutoGamma outbound message ingestion failed",
    );
    res.status(500).json({ error: "Unable to record outbound message" });
  }
});

export default router;