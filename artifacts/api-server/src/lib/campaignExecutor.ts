import mongoose from "mongoose";
import { CampaignModel } from "../models/Campaign";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { CampaignSendModel } from "../models/CampaignSend";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { TemplateModel } from "../models/Template";
import { sendTemplateMessage } from "./whatsapp";
import { withCreditCharge } from "./creditDeduction";
import { logger } from "./logger";

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

  const templateId = input.templateId ?? campaign.templateId;
  const template = await TemplateModel.findOne({ _id: templateId, userId }).lean();
  if (!template || String(template.status).toUpperCase() !== "APPROVED") {
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

  const idempotencyKey = `${campaignId}:${contactId}:${stepId}`;
  let send;
  try {
    send = await CampaignSendModel.create({
      userId,
      campaignId,
      recipientId,
      contactId,
      stepId,
      templateId: new mongoose.Types.ObjectId(String(template._id)),
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
      category: template.category,
      campaignId,
      description: `Campaign message to ${contact.phone}`,
      send: () => sendTemplateMessage(
        contact.phone,
        template.name,
        template.language ?? "en_US",
        buildComponents(values, contact),
        String(userId),
      ),
    });
    const whatsappMessageId = result.messages?.[0]?.id ?? null;
    await CampaignSendModel.updateOne(
      { _id: send._id },
      { $set: { status: "SENT", whatsappMessageId, sentAt: new Date() } },
    );
    await MessageModel.create({
      userId,
      contactId,
      campaignId,
      direction: "OUTBOUND",
      body: resolveBody(template.body, values, contact),
      templateId: template._id,
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
      { _id: send._id },
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
      body: resolveBody(template.body, values, contact),
      templateId: template._id,
      status: "FAILED",
      failureReason: reason,
    });
    await CampaignModel.updateOne({ _id: campaignId, userId }, { $inc: { "stats.failed": 1 } });
    logger.error({ err: reason, campaignId: String(campaignId), contactId: String(contactId) }, "Campaign executor send failed");
    throw error;
  }
}