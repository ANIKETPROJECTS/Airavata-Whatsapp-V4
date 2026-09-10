/**
 * Module 6: Webhook Handling
 * Handles Meta's webhook verification handshake and incoming event payloads.
 * Register this URL in Meta's App Dashboard under WhatsApp > Configuration.
 * Set WHATSAPP_VERIFY_TOKEN in Replit Secrets to the same token you enter in Meta.
 */

import { Router } from "express";
import { MessageModel } from "../models/Message";
import { ContactModel } from "../models/Contact";
import { UserModel } from "../models/User";
import { CampaignModel } from "../models/Campaign";
import { CampaignSendModel } from "../models/CampaignSend";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { FlowModel } from "../models/Flow";
import { TemplateModel } from "../models/Template";
import { ChatbotFlowModel } from "../models/ChatbotFlow";
import { runWithTenant } from "../lib/tenantDatabase";
import mongoose from "mongoose";
import { logger } from "../lib/logger";
import {
  runChatbotEngine,
  runChatbotFlowById,
  resumeChatbotAfterFlowSubmission,
} from "../lib/chatbotEngine";
import { sendInquiryCreated } from "../lib/airavataIntegration";
import { enrollNewContactsInTriggerCampaigns } from "../lib/triggerEnrollment";
import { emitClientWebhookEvent, emitContactCreatedEvent } from "../lib/clientWebhooks";
import { normalizeContactPhone } from "../lib/contactPhone";
import {
  getEcosystemWhatsAppCredentialIds,
  PROTECTED_MASTER_ADMIN_EMAIL,
} from "../lib/protectedMasterAdmin";

const router = Router();

const OPT_OUT_REPLIES = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "opt out",
  "opt-out",
]);

/** Strip all non-digit characters for phone comparison */
function isOptOutReply(value: string | undefined): boolean {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^[.!?,;:\s]+|[.!?,;:\s]+$/g, "")
    .replace(/\s+/g, " ");
  return normalized ? OPT_OUT_REPLIES.has(normalized) : false;
}

async function resolveOwningUser(phoneNumberId: string) {
  const connectedOwner = await UserModel.findOne({ metaPhoneNumberId: phoneNumberId })
    .select("_id")
    .lean();
  if (connectedOwner) return connectedOwner;

  // The protected operator account intentionally has no Embedded Signup
  // record, so its receiving number is owned through ecosystem config.
  const ecosystemIds = getEcosystemWhatsAppCredentialIds();
  if (ecosystemIds.phoneNumberId !== phoneNumberId) return null;

  return UserModel.findOne({
    $or: [
      { isProtectedMasterAdmin: true },
      { email: PROTECTED_MASTER_ADMIN_EMAIL },
    ],
  })
    .select("_id")
    .lean();
}

// ── GET /api/webhook — Meta verification handshake ────────────────────────────

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;

  // WHATSAPP_VERIFY_TOKEN is the configured Replit secret name. Keep the
  // legacy WEBHOOK_VERIFY_TOKEN fallback for existing deployments.
  const verifyToken =
    process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.warn("WHATSAPP_VERIFY_TOKEN is not set — webhook verification will fail");
    res.status(500).send("WHATSAPP_VERIFY_TOKEN not configured in Secrets");
    return;
  }

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("Webhook verified by Meta");
    res.status(200).send(challenge);
  } else {
    logger.warn({ mode, token }, "Webhook verification failed — token mismatch");
    res.status(403).send("Forbidden");
  }
});

// ── POST /api/webhook — receive events from Meta ──────────────────────────────

router.post("/webhook", async (req, res) => {
  // Must acknowledge immediately; Meta will retry if we don't respond within 5s
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body as WebhookBody;
    logger.info({
      object: body?.object,
      entryCount: body?.entry?.length ?? 0,
      changeCount: body?.entry?.reduce((sum, entry) => sum + (entry.changes?.length ?? 0), 0) ?? 0,
    }, "Webhook request received");
    if (body?.object !== "whatsapp_business_account") return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value || change.field !== "messages") continue;

        // Debug: log what we received
        logger.info(
          { messageCount: value.messages?.length ?? 0, statusCount: value.statuses?.length ?? 0 },
          "Webhook change received"
        );

        // Handle incoming messages
        for (const msg of value.messages ?? []) {
          logger.info({ msgId: msg.id, from: msg.from, type: msg.type }, "Processing incoming message");
          await handleIncomingMessage(
            msg,
            value.contacts ?? [],
            value.metadata?.phone_number_id,
          ).catch((err) =>
            logger.error({ err: String(err), msgId: msg.id }, "Error handling incoming message"),
          );
        }

        // Handle status updates (delivered, read, failed)
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(status, value.metadata?.phone_number_id).catch((err: unknown) =>
            logger.error({ err, status }, "Error handling status update"),
          );
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Unhandled webhook error");
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleIncomingMessage(
  msg: WebhookMessage,
  waContacts: WebhookContact[],
  phoneNumberId: string | undefined,
  tenantUserId?: string,
): Promise<void> {
  const fromRaw = msg.from; // digits only, no +, e.g. "919876543210"
  if (!fromRaw) {
    logger.warn({ msgId: msg.id, type: msg.type }, "Skipping message with no 'from' field");
    return;
  }
  const normalizedFromPhone = normalizeContactPhone(fromRaw);

  // Resolve the tenant from the receiving WhatsApp phone number before
  // reading or creating any contact. Once resolved, recurse inside the
  // tenant database context so every subsequent model operation is isolated.
  if (!phoneNumberId) {
    logger.error(
      { msgId: msg.id, from: fromRaw },
      "Incoming webhook message has no phone_number_id; skipping",
    );
    return;
  }

  if (!tenantUserId) {
    const owningUser = await resolveOwningUser(phoneNumberId);
    logger.info(
      {
        msgId: msg.id,
        phoneNumberId,
        owningUserId: owningUser ? String(owningUser._id) : undefined,
      },
      "Resolved incoming WhatsApp message tenant",
    );
    if (!owningUser) {
      logger.error(
        { msgId: msg.id, from: fromRaw, phoneNumberId },
        "No user matches incoming webhook phone_number_id; skipping",
      );
      return;
    }
    return runWithTenant(String(owningUser._id), () =>
      handleIncomingMessage(msg, waContacts, phoneNumberId, String(owningUser._id)),
    );
  }

  const userId = new mongoose.Types.ObjectId(tenantUserId);
  logger.info(
    {
      msgId: msg.id,
      phoneNumberId,
      userId: String(userId),
    },
    "Processing incoming WhatsApp message in tenant context",
  );

  // Find a Contact for this tenant whose normalized phone matches.
  const tenantContacts = await ContactModel.find({ userId }).lean();
  const contact = tenantContacts.find(
    (c) => normalizeContactPhone(c.phone) === normalizedFromPhone,
  );

  let contactId: mongoose.Types.ObjectId;

  if (contact) {
    contactId = contact._id as mongoose.Types.ObjectId;
  } else {
    // Auto-create the contact under the user owning the receiving number.
    const waContact = waContacts.find((wc) => {
      try {
        return normalizeContactPhone(wc.wa_id) === normalizedFromPhone;
      } catch {
        return false;
      }
    });
    const displayName = waContact?.profile?.name ?? fromRaw;

    const created = await ContactModel.create({
      userId,
      name: displayName,
      phone: normalizedFromPhone,
    });
    await enrollNewContactsInTriggerCampaigns(userId, [created._id]);
      void emitContactCreatedEvent(userId, created._id);
    contactId = created._id as mongoose.Types.ObjectId;
    logger.info({ phone: fromRaw, name: displayName }, "Auto-created contact from webhook");
  }

  // Extract text body and optional flow response data
  let body: string | undefined;
  let flowData: Record<string, unknown> | undefined;
  let flowId: mongoose.Types.ObjectId | undefined;
  let campaignId: mongoose.Types.ObjectId | undefined;
  let interactiveReplyId: string | undefined; // button_reply / list_reply ID for chatbot engine
  let runChatbot = false; // only fire engine for text + interactive button/list replies
  let isTemplateQuickReply = false; // true only for template quick-reply button taps (msg.type === "button")

  // DEBUG: log full raw message to diagnose interactive parsing
  logger.info({ rawMsg: JSON.stringify(msg) }, "RAW incoming message");

  if (msg.type === "text") {
    body = msg.text?.body;
    runChatbot = true;
  } else if (msg.type === "button") {
    // User tapped a Quick Reply button on a template message
    body = msg.button?.text ?? msg.button?.payload ?? "[button]";
    runChatbot = true;
    isTemplateQuickReply = true;
    logger.info({ payload: msg.button?.payload, text: msg.button?.text }, "Template quick-reply button tapped");
  } else if (msg.type === "image") {
    body = "[Image]";
  } else if (msg.type === "document") {
    body = "[Document]";
  } else if (msg.type === "audio") {
    body = "[Audio]";
  } else if (msg.type === "interactive") {
    // Log everything we see for interactive so we can diagnose the exact structure
    const rawInteractive = (msg as Record<string, unknown>)["interactive"];
    logger.info({ rawInteractive: JSON.stringify(rawInteractive) }, "Interactive message raw payload");

    const interactive = rawInteractive as {
      type?: string;
      nfm_reply?: { response_json?: string; body?: string; name?: string };
    } | undefined;

    if (interactive?.type === "nfm_reply" && interactive.nfm_reply?.response_json) {
      // WhatsApp Flow submission — parse the structured response
      try {
        const rawResponse = interactive.nfm_reply.response_json;
        const parsed = typeof rawResponse === "string"
          ? JSON.parse(rawResponse)
          : rawResponse;
        flowData = (typeof parsed === "object" && parsed !== null) ? parsed as Record<string, unknown> : { raw: parsed };
        body = "📋 Form submitted";
        logger.info({
          from: fromRaw,
          responseKeys: Object.keys(flowData),
          hasNestedData: Boolean(flowData["data"] && typeof flowData["data"] === "object"),
        }, "Parsed WhatsApp Flow response");

        // Resolve the flow this submission belongs to via flow_token ("flow_<internalId>_<ts>")
        const nestedResponse = flowData["data"];
        const nestedToken = nestedResponse && typeof nestedResponse === "object"
          ? (nestedResponse as Record<string, unknown>)["flow_token"]
          : undefined;
        const token =
          (typeof flowData["flow_token"] === "string" ? flowData["flow_token"] : undefined) ??
          (typeof nestedToken === "string" ? nestedToken : undefined);
        if (token) {
          const match = token.match(/^flow_([a-f0-9]{24})(?:_campaign_([a-f0-9]{24}))?_/);
          if (match?.[1]) {
            const candidate = await FlowModel.findOne({ _id: match[1], userId }).lean();
            if (candidate) {
              flowId = candidate._id as mongoose.Types.ObjectId;
              if (match[2]) {
                const campaign = await CampaignModel.findOne({
                  _id: match[2],
                  userId,
                  type: "FLOW",
                  flowId: candidate._id,
                }).lean();
                if (campaign) campaignId = campaign._id as mongoose.Types.ObjectId;
              }
            }
          }
        }

        // Meta commonly returns only {screen, data} in response_json. In that
        // case resolve the Flow document from the chatbot node that is paused
        // for this contact, so the response remains visible in Flow Responses.
        if (!flowId) {
          const session = (contact as Record<string, unknown>)["chatbotSession"] as
            { flowId?: string; currentNodeId?: string } | undefined;
          if (session?.flowId && session.currentNodeId) {
            const chatbot = await ChatbotFlowModel.findOne({
              _id: session.flowId,
              userId,
              status: "PUBLISHED",
            }).lean();
            const pausedNode = chatbot?.nodes?.find((node) => node.id === session.currentNodeId);
            const flowReference = pausedNode?.data && typeof pausedNode.data === "object"
              ? (pausedNode.data as Record<string, unknown>)["flowId"]
              : undefined;
            if (typeof flowReference === "string" && mongoose.Types.ObjectId.isValid(flowReference)) {
              const candidate = await FlowModel.findOne({ _id: flowReference, userId }).lean();
              if (candidate) flowId = candidate._id as mongoose.Types.ObjectId;
            }
          }
        }
        logger.info({
          from: fromRaw,
          tokenFound: Boolean(token),
          flowId: flowId ? String(flowId) : undefined,
          campaignId: campaignId ? String(campaignId) : undefined,
          sessionFound: Boolean((contact as Record<string, unknown>)["chatbotSession"]),
        }, "Resolved WhatsApp Flow submission context");
      } catch (parseErr) {
        logger.error({ parseErr: String(parseErr), rawJson: interactive.nfm_reply.response_json }, "Failed to parse nfm_reply response_json");
        body = "📋 Form submitted (parse error)";
      }
      // Do NOT run chatbot on form submissions
    } else if (interactive?.type === "button_reply") {
      // CTA button press — resume chatbot session
      const br = interactive.button_reply as { id: string; title: string } | undefined;
      body = br?.title ?? "[button]";
      interactiveReplyId = br?.id;
      runChatbot = true;
      logger.info({ buttonId: interactiveReplyId, title: body }, "Button reply received");
    } else if (interactive?.type === "list_reply") {
      // List row selection — resume chatbot session
      const lr = interactive.list_reply as { id: string; title: string; description?: string } | undefined;
      body = lr?.title ?? "[list selection]";
      interactiveReplyId = lr?.id;
      runChatbot = true;
      logger.info({ rowId: interactiveReplyId, title: body }, "List reply received");
    } else {
      logger.warn({ interactiveType: interactive?.type }, "Interactive message is not nfm_reply — falling back");
      body = `[${msg.type}]`;
    }
  } else {
    body = `[${msg.type}]`;
  }

  const isOptOut = isOptOutReply(body);
  if (isOptOut) {
    // Do not let chatbot automation respond to an unsubscribe request.
    runChatbot = false;
  }

  // Avoid duplicate messages
  const existing = await MessageModel.findOne({ whatsappMessageId: msg.id, userId });
  if (existing) return;

  const hasPreviousInboundMessage = Boolean(
    await MessageModel.exists({
      userId,
      contactId,
      direction: "INBOUND",
    }),
  );

  const createdMessage = await MessageModel.create({
    userId,
    contactId,
    direction: "INBOUND",
    body,
    whatsappMessageId: msg.id,
    status: "RECEIVED",
    ...(flowData ? { flowData } : {}),
    ...(flowId ? { flowId } : {}),
    ...(campaignId ? { campaignId } : {}),
  });
  logger.info(
    {
      userId: String(userId),
      contactId: String(contactId),
      messageId: String(createdMessage._id),
      whatsappMessageId: msg.id,
      event: "message_received",
    },
    "Inbound message persisted; scheduling client webhook delivery",
  );
  void emitClientWebhookEvent(userId, "message_received", {
    message: {
      id: String(createdMessage._id),
      whatsappMessageId: msg.id,
      contactId: String(contactId),
      body: body ?? null,
      type: msg.type,
      receivedAt: createdMessage.createdAt,
    },
    contact: {
      id: String(contactId),
      name: contact?.name ?? fromRaw,
      phone: normalizedFromPhone,
    },
  });

  // New customer activity belongs in Open and remains unread until an agent
  // opens the conversation. This also reopens conversations previously marked
  // Resolved.
  await ContactModel.findOneAndUpdate(
    { _id: contactId, userId },
    {
      $set: {
        lastContactedAt: new Date(),
        chatState: "ACTIVE",
        ...(isOptOut ? { status: "unsubscribed" } : {}),
      },
    },
  );

  logger.info({ from: fromRaw, body }, "Stored incoming message");
  if (isOptOut) {
    logger.info({ contactId: String(contactId), keyword: body }, "Contact automatically unsubscribed from WhatsApp messaging");
  }

  if (!hasPreviousInboundMessage) {
    void sendInquiryCreated({
      eventType: "inquiry.created",
      eventId: msg.id,
      sourceSystem: "airavata",
      source: "whatsapp",
      externalInquiryId: `whatsapp:${normalizedFromPhone}`,
      customer: {
        name: contact?.name ?? fromRaw,
        phone: normalizedFromPhone,
        whatsappContactName: contact?.name ?? fromRaw,
      },
      vehicle: {
        model: "Not specified",
        category: "Not specified",
      },
      service: {
        name: "WhatsApp inquiry",
        currency: "INR",
      },
      appointment: {
        timezone: "Asia/Kolkata",
        notes: body ?? "",
      },
      stage: "NEW",
      references: {
        airavataContactId: String(contactId),
      },
      occurredAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
    });
  }

  // A WhatsApp Flow submission continues the paused chatbot at the node
  // connected after Flow Reply. It must not restart keyword matching.
  if (flowData) {
    resumeChatbotAfterFlowSubmission(contactId, userId, flowData)
      .then(() => logger.info({ contactId: String(contactId) }, "Chatbot resumed after Flow submission"))
      .catch((err) =>
        logger.error({ err: String(err), contactId: String(contactId) }, "Chatbot resume after Flow submission failed"),
      );
  }

  // Fire chatbot engine for text messages and interactive button/list replies
  if (runChatbot) {
    // Only try the linked-template shortcut for actual template quick-reply taps
    // (msg.type === "button"). Interactive button_reply / list_reply messages are
    // responses to CTA buttons sent *by* a running flow and must resume the session
    // via runChatbotEngine — not restart the linked flow from scratch.
    const didRunLinked =
      isTemplateQuickReply &&
      (await tryRunLinkedChatbot(contactId, userId, body, interactiveReplyId));
    if (!didRunLinked) {
      runChatbotEngine(contactId, userId, { text: body, interactiveReplyId }).catch((err) =>
        logger.error({ err: String(err) }, "Chatbot engine error"),
      );
    }
  }
}

/**
 * If the contact's most recent inbound-triggering message came from a template
 * with a linkedChatbotFlowId, run that flow directly and return true.
 * Returns false if no linked flow was found so the caller can fall back to
 * the normal keyword/start-trigger engine.
 */
async function tryRunLinkedChatbot(
  contactId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  buttonText: string | undefined,
  interactiveReplyId: string | undefined,
): Promise<boolean> {
  try {
    // Find the most recent outbound template message sent to this contact
    const lastTemplatMsg = await MessageModel.findOne({
      userId,
      contactId,
      direction: "OUTBOUND",
      templateId: { $exists: true, $ne: null },
    }).sort({ createdAt: -1 }).lean();

    if (!lastTemplatMsg?.templateId) return false;

    const template = await TemplateModel.findById(lastTemplatMsg.templateId).lean();
    if (!template?.linkedChatbotFlowId) return false;

    logger.info(
      { templateId: String(lastTemplatMsg.templateId), flowId: String(template.linkedChatbotFlowId) },
      "Template Quick Reply → launching linked chatbot flow",
    );

    runChatbotFlowById(
      String(template.linkedChatbotFlowId),
      contactId,
      userId,
      { text: buttonText, interactiveReplyId },
    ).catch((err) => logger.error({ err: String(err) }, "Linked chatbot flow error"));

    return true;
  } catch (err) {
    logger.error({ err: String(err) }, "tryRunLinkedChatbot error");
    return false;
  }
}

async function handleStatusUpdate(
  status: WebhookStatus,
  phoneNumberId?: string,
  tenantUserId?: string,
): Promise<void> {
  if (!phoneNumberId) return;
  if (!tenantUserId) {
    const owner = await resolveOwningUser(phoneNumberId);
    if (!owner) return;
    return runWithTenant(String(owner._id), () =>
      handleStatusUpdate(status, phoneNumberId, String(owner._id)),
    );
  }

  const update: Record<string, unknown> = { status: status.status.toUpperCase() };

  if (status.status === "delivered") update.deliveredAt = new Date(Number(status.timestamp) * 1000);
  if (status.status === "read") update.readAt = new Date(Number(status.timestamp) * 1000);
  if (status.status === "failed") {
    const metaError = status.errors?.[0];
    const metaErrorTitle = metaError?.title ?? metaError?.message ?? "Unknown error";
    const metaErrorDetails =
      metaError?.details ??
      metaError?.error_data?.details ??
      metaError?.message;
    update.status = "FAILED";
    update.failureReason = metaErrorTitle;
    if (typeof metaError?.code === "number") update.metaErrorCode = metaError.code;
    update.metaErrorTitle = metaErrorTitle;
    if (metaErrorDetails) update.metaErrorDetails = metaErrorDetails;
  }

  // Meta can retry the same webhook, and status notifications can arrive out
  // of order. Only the first transition into a status may update the message
  // and campaign counters. The status predicate makes this atomic, so two
  // concurrent duplicate webhooks cannot both increment the same counter.
  const statusFilter: Record<string, unknown> = {
    whatsappMessageId: status.id,
    userId: new mongoose.Types.ObjectId(tenantUserId),
  };
  if (status.status === "delivered") {
    statusFilter.status = { $nin: ["DELIVERED", "READ", "FAILED"] };
  } else if (status.status === "read") {
    statusFilter.status = { $nin: ["READ", "FAILED"] };
  } else if (status.status === "failed") {
    statusFilter.status = { $nin: ["FAILED", "DELIVERED", "READ"] };
  } else if (status.status === "sent") {
    statusFilter.status = { $nin: ["SENT", "DELIVERED", "READ", "FAILED"] };
  }

  const msg = await MessageModel.findOneAndUpdate(
    statusFilter,
    { $set: update },
    { new: true },
  );

  const campaignSend = await CampaignSendModel.findOneAndUpdate(
    statusFilter,
    { $set: update },
    { new: true },
  );

  if (!msg && !campaignSend) {
    const [knownMessage, knownCampaignSend] = await Promise.all([
      MessageModel.exists({
        whatsappMessageId: status.id,
        userId: new mongoose.Types.ObjectId(tenantUserId),
      }),
      CampaignSendModel.exists({
        whatsappMessageId: status.id,
        userId: new mongoose.Types.ObjectId(tenantUserId),
      }),
    ]);
    if (knownMessage || knownCampaignSend) {
      logger.info(
        { id: status.id, status: status.status },
        "Ignored duplicate or stale message status",
      );
    } else {
      logger.warn(
        { id: status.id, status: status.status },
        "Ignored status for unknown message",
      );
    }
    return;
  }

  // A campaign send is the report source of truth. Legacy messages without a
  // CampaignSend row still update their Message record and cached campaign
  // counter for compatibility.
  const campaignId = campaignSend?.campaignId ?? msg?.campaignId;
  if (
    campaignId &&
    (status.status === "delivered" || status.status === "read" || status.status === "failed") &&
    (campaignSend || !msg?.campaignId)
  ) {
    const field =
      status.status === "delivered"
        ? "stats.delivered"
        : status.status === "read"
          ? "stats.read"
          : "stats.failed";
    await CampaignModel.findOneAndUpdate(
      {
        _id: campaignId,
        userId: new mongoose.Types.ObjectId(tenantUserId),
      },
      { $inc: { [field]: 1 } },
    );
  }

  if (campaignSend && status.status === "failed") {
    const metaError = status.errors?.[0];
    const diagnostic = [
      typeof metaError?.code === "number" ? `Meta code ${metaError.code}` : null,
      metaError?.title ?? metaError?.message ?? "Unknown error",
      metaError?.details ?? metaError?.error_data?.details ?? null,
    ].filter(Boolean).join(": ");
    await CampaignRecipientModel.updateOne(
      {
        _id: campaignSend.recipientId,
        userId: new mongoose.Types.ObjectId(tenantUserId),
        status: { $nin: ["FAILED", "OPTED_OUT", "SKIPPED"] },
      },
      {
        $set: {
          status: "FAILED",
          lastError: diagnostic,
        },
      },
    );
  }

  if (!campaignSend && msg?.campaignId) {
    logger.info(
      { id: status.id, status: status.status },
      "Updated legacy campaign message status without CampaignSend row",
    );
  }

  if (msg || campaignSend) {
    logger.info(
      { id: status.id, status: status.status, campaignSendUpdated: Boolean(campaignSend) },
      "Updated message and campaign send status",
    );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: WebhookValue;
    }>;
  }>;
}

interface WebhookValue {
  messaging_product: string;
  metadata?: { display_phone_number: string; phone_number_id?: string };
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  contacts?: WebhookContact[];
}

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; filename?: string };
  audio?: { id: string };
  /** Sent when a user taps a Quick Reply button on a template message */
  button?: { payload: string; text: string };
  interactive?: {
    type: string;
    nfm_reply?: { name: string; response_json: string; body: string };
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

interface WebhookStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    details?: string;
    error_data?: { details?: string };
  }>;
}

interface WebhookContact {
  profile?: { name: string };
  wa_id: string;
}

export default router;
