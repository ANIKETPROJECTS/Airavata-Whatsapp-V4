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

const router = Router();

/** Strip all non-digit characters for phone comparison */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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
  const fromNorm = normalizePhone(fromRaw);

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
    const owningUser = await UserModel.findOne({ metaPhoneNumberId: phoneNumberId })
      .select("_id")
      .lean();
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

  // Find a Contact for this tenant whose normalized phone matches.
  const tenantContacts = await ContactModel.find({ userId }).lean();
  const contact = tenantContacts.find(
    (c) => normalizePhone(c.phone) === fromNorm,
  );

  let contactId: mongoose.Types.ObjectId;

  if (contact) {
    contactId = contact._id as mongoose.Types.ObjectId;
  } else {
    // Auto-create the contact under the user owning the receiving number.
    const waContact = waContacts.find((wc) => normalizePhone(wc.wa_id) === fromNorm);
    const displayName = waContact?.profile?.name ?? fromRaw;

    const created = await ContactModel.create({
      userId,
      name: displayName,
      phone: `+${fromRaw}`,
    });
    contactId = created._id as mongoose.Types.ObjectId;
    logger.info({ phone: fromRaw, name: displayName }, "Auto-created contact from webhook");
  }

  // Extract text body and optional flow response data
  let body: string | undefined;
  let flowData: Record<string, unknown> | undefined;
  let flowId: mongoose.Types.ObjectId | undefined;
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
          const match = token.match(/^flow_([a-f0-9]{24})_/);
          if (match?.[1]) {
            const candidate = await FlowModel.findOne({ _id: match[1], userId }).lean();
            if (candidate) flowId = candidate._id as mongoose.Types.ObjectId;
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

  // Avoid duplicate messages
  const existing = await MessageModel.findOne({ whatsappMessageId: msg.id });
  if (existing) return;

  const hasPreviousInboundMessage = Boolean(
    await MessageModel.exists({
      contactId,
      direction: "INBOUND",
    }),
  );

  await MessageModel.create({
    userId,
    contactId,
    direction: "INBOUND",
    body,
    whatsappMessageId: msg.id,
    status: "RECEIVED",
    ...(flowData ? { flowData } : {}),
    ...(flowId ? { flowId } : {}),
  });

  // New customer activity belongs in Open and remains unread until an agent
  // opens the conversation. This also reopens conversations previously marked
  // Resolved.
  await ContactModel.findByIdAndUpdate(contactId, {
    $set: { lastContactedAt: new Date(), chatState: "ACTIVE" },
  });

  logger.info({ from: fromRaw, body }, "Stored incoming message");

  if (!hasPreviousInboundMessage) {
    void sendInquiryCreated({
      eventType: "inquiry.created",
      eventId: msg.id,
      sourceSystem: "airavata",
      source: "whatsapp",
      externalInquiryId: `whatsapp:${fromNorm}`,
      customer: {
        name: contact?.name ?? fromRaw,
        phone: `+${fromRaw}`,
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
    const owner = await UserModel.findOne({ metaPhoneNumberId: phoneNumberId }).select("_id").lean();
    if (!owner) return;
    return runWithTenant(String(owner._id), () =>
      handleStatusUpdate(status, phoneNumberId, String(owner._id)),
    );
  }

  const update: Record<string, unknown> = { status: status.status.toUpperCase() };

  if (status.status === "delivered") update.deliveredAt = new Date(Number(status.timestamp) * 1000);
  if (status.status === "read") update.readAt = new Date(Number(status.timestamp) * 1000);
  if (status.status === "failed") {
    update.status = "FAILED";
    update.failureReason = status.errors?.[0]?.title ?? "Unknown error";
  }

  const msg = await MessageModel.findOneAndUpdate(
    { whatsappMessageId: status.id },
    { $set: update },
    { new: true },
  );

  if (!msg) return;

  // Propagate stats to campaign if applicable
  if (msg.campaignId && (status.status === "delivered" || status.status === "read" || status.status === "failed")) {
    const field =
      status.status === "delivered"
        ? "stats.delivered"
        : status.status === "read"
          ? "stats.read"
          : "stats.failed";
    await CampaignModel.findByIdAndUpdate(msg.campaignId, { $inc: { [field]: 1 } });
  }

  logger.info({ id: status.id, status: status.status }, "Updated message status");
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
  errors?: Array<{ code: number; title: string }>;
}

interface WebhookContact {
  profile?: { name: string };
  wa_id: string;
}

export default router;
