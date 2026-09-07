import mongoose from "mongoose";
import { CampaignModel } from "../models/Campaign";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { CampaignSendModel } from "../models/CampaignSend";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { TemplateModel } from "../models/Template";
import { FlowModel } from "../models/Flow";
import { sendTemplateMessage, sendWhatsAppFlowMessage } from "./whatsapp";
import { withCreditCharge } from "./creditDeduction";
import { logger } from "./logger";
import { checkMessagingLimitBeforeSend } from "./messagingLimit";

type VariableValues = Record<string, string>;

function resolveBody(body: string, values: VariableValues, contact: { name?: string; phone: string }) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, index: string) => {
    let value = values[index] ?? "";
    value = value.replace(/\{\{name\}\}/gi, contact.name ?? "");
    value = value.replace(/\{\{phone\}\}/gi, contact.phone);
    return value || `{{${index}}}`;
  });
}

function buildComponents(values: VariableValues, contact: { name?: string; phone: string }) {
  const indices = Object.keys(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!indices.length) return [];
  return [{
    type: "body",
    parameters: indices.map((index) => ({
      type: "text",
      text: (values[String(index)] ?? "")
        .replace(/\{\{name\}\}/gi, contact.name ?? "")
        .replace(/\{\{phone\}\}/gi, contact.phone),
    })),
  }];
}

export type ExecuteCampaignSendInput = {
  userId: mongoose.Types.ObjectId | string;
  campaignId: mongoose.Types.ObjectId | string;
  recipientId: mongoose.Types.ObjectId | string;
  contactId: mongoose.Types.ObjectId | string;
  stepId?: string;
  templateId?: mongoose.Types.ObjectId | string;
  variableValues?: VariableValues;
};

/**
 * The only service allowed to send campaign template messages. It claims the
 * unique campaign/contact/step row before calling Meta, checks DND at send
 * time, and records both the provider message and the reporting message.
 */
export async function executeCampaignSend(input: ExecuteCampaignSendInput) {
  const userId = new mongoose.Types.ObjectId(String(input.userId));
  const campaignId = new mongoose.Types.ObjectId(String(input.campaignId));
  const recipientId = new mongoose.Types.ObjectId(String(input.recipientId));
  const contactId = new mongoose.Types.ObjectId(String(input.contactId));
  const stepId = input.stepId ?? "initial";

  const campaign = await CampaignModel.findOne({ _id: campaignId, userId }).lean();
  if (!campaign) throw new Error("Campaign not found");

  const isFlowCampaign = campaign.type === "FLOW";
  const templateId = input.templateId ?? campaign.templateId;
  const template = !isFlowCampaign && templateId
    ? await TemplateModel.findOne({ _id: templateId, userId }).lean()
    : null;
  const flow = isFlowCampaign && campaign.flowId
    ? await FlowModel.findOne({ _id: campaign.flowId, userId }).lean()
    : null;
  if (isFlowCampaign) {
    if (!flow || flow.status !== "PUBLISHED" || !flow.metaFlowId) {
      throw new Error("Published Flow not found for campaign");
    }
  } else if (!template || String(template.status).toUpperCase() !== "APPROVED") {
    throw new Error("Only APPROVED templates can be used in campaigns");
  }

  const contact = await ContactModel.findOne({ _id: contactId, userId }).lean();
  if (!contact) throw new Error("Contact not found");

  if (contact.status !== "active") {
    await CampaignRecipientModel.updateOne(
      { _id: recipientId, userId },
      { $set: { status: contact.status === "unsubscribed" ? "OPTED_OUT" : "SKIPPED", lastError: "Contact is not eligible for campaign sends" } },
    );
    return { skipped: true, reason: "CONTACT_NOT_ACTIVE" as const };
  }

  const messagingLimit = await checkMessagingLimitBeforeSend(
    String(userId),
    contactId,
  );
  if (!messagingLimit.allowed) {
    await CampaignRecipientModel.updateOne(
      { _id: recipientId, userId, status: { $in: ["ACTIVE", "QUEUED"] } },
      {
        $set: {
          status: "QUEUED",
          nextActionAt: messagingLimit.resumeAt,
          lastError: `Daily WhatsApp messaging limit safeguard reached (${messagingLimit.uniqueContactsMessagedToday}/${messagingLimit.limit}); resumes next day`,
        },
      },
    );
    return {
      deferred: true,
      reason: "MESSAGING_LIMIT_REACHED" as const,
      resumeAt: messagingLimit.resumeAt,
    };
  }

  const idempotencyKey = `${campaignId}:${contactId}:${stepId}`;
  let send;
  try {
    send = await CampaignSendModel.create({
      userId,
      campaignId,
      recipientId,
      contactId,
      stepId,
      ...(template ? { templateId: new mongoose.Types.ObjectId(String(template._id)) } : {}),
      ...(flow ? { flowId: new mongoose.Types.ObjectId(String(flow._id)) } : {}),
      idempotencyKey,
      status: "SENDING",
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { duplicate: true, reason: "SEND_ALREADY_CLAIMED" as const };
    }
    throw error;
  }

  const values = input.variableValues ?? (campaign.variableValues as VariableValues | undefined) ?? {};
  try {
    const result = await withCreditCharge({
      userId,
      category: template?.category,
      campaignId,
      description: `Campaign message to ${contact.phone}`,
      send: () => isFlowCampaign
        ? sendWhatsAppFlowMessage(
            contact.phone,
            flow!,
            String(userId),
            { campaignId: String(campaignId), recipientId: String(recipientId) },
          )
        : sendTemplateMessage(
            contact.phone,
            template!.name,
            template!.language ?? "en_US",
            buildComponents(values, contact),
            String(userId),
          ),
    });
    const whatsappMessageId = result.messages?.[0]?.id ?? null;
    await CampaignSendModel.updateOne(
      { _id: send._id, userId },
      { $set: { status: "SENT", whatsappMessageId, sentAt: new Date() } },
    );
    await MessageModel.create({
      userId,
      contactId,
      campaignId,
      direction: "OUTBOUND",
      body: isFlowCampaign ? `WhatsApp Flow: ${flow!.name}` : resolveBody(template!.body, values, contact),
      ...(template ? { templateId: template._id } : {}),
      ...(flow ? { flowId: flow._id } : {}),
      whatsappMessageId,
      status: "SENT",
      sentAt: new Date(),
    });
    await CampaignRecipientModel.updateOne(
      { _id: recipientId, userId },
      { $set: { status: "COMPLETED", completedAt: new Date() } },
    );
    await CampaignModel.updateOne({ _id: campaignId, userId }, { $inc: { "stats.sent": 1 } });
    await ContactModel.updateOne({ _id: contactId, userId }, { $set: { lastContactedAt: new Date() } });
    return { sent: true, whatsappMessageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Campaign send failed";
    await CampaignSendModel.updateOne(
      { _id: send._id, userId },
      { $set: { status: "FAILED", failureReason: reason }, $inc: { retryCount: 1 } },
    );
    await CampaignRecipientModel.updateOne(
      { _id: recipientId, userId },
      { $set: { status: "FAILED", lastError: reason } },
    );
    await MessageModel.create({
      userId,
      contactId,
      campaignId,
      direction: "OUTBOUND",
      body: isFlowCampaign ? `WhatsApp Flow: ${flow!.name}` : resolveBody(template!.body, values, contact),
      ...(template ? { templateId: template._id } : {}),
      ...(flow ? { flowId: flow._id } : {}),
      status: "FAILED",
      failureReason: reason,
    });
    await CampaignModel.updateOne({ _id: campaignId, userId }, { $inc: { "stats.failed": 1 } });
    logger.error({ err: reason, campaignId: String(campaignId), contactId: String(contactId) }, "Campaign executor send failed");
    throw error;
  }
}