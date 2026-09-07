import { CampaignModel } from "../models/Campaign";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { UserModel } from "../models/User";
import mongoose from "mongoose";
import { executeCampaignSend } from "./campaignExecutor";
import { logger } from "./logger";
import { runWithTenant } from "./tenantDatabase";

let running = false;

/**
 * Claims one due recipient at a time. The atomic claim prevents multiple API
 * instances from processing the same contact concurrently.
 */
async function processDueCampaignRecipientsForTenant(userId: mongoose.Types.ObjectId) {
    for (;;) {
      const recipient = await CampaignRecipientModel.findOneAndUpdate(
        {
          userId,
          status: "QUEUED",
          nextActionAt: { $lte: new Date() },
        },
        { $set: { status: "ACTIVE" } },
        { new: true, sort: { nextActionAt: 1 } },
      ).lean();
      if (!recipient) break;

      try {
        const result = await executeCampaignSend({
          userId: recipient.userId,
          campaignId: recipient.campaignId,
          recipientId: recipient._id,
          contactId: recipient.contactId,
          stepId: recipient.currentStepId ?? "initial",
        });
        const campaign = await CampaignModel.findOne({
          _id: recipient.campaignId,
          userId,
        }).lean();
        if (
          result &&
          "sent" in result &&
          result.sent &&
          campaign?.type === "DRIP" &&
          Array.isArray(campaign.steps)
        ) {
          const currentIndex = campaign.steps.findIndex((step) => step.id === (recipient.currentStepId ?? "initial"));
          const next = campaign.steps[currentIndex + 1];
          if (next) {
            const delayMinutes = Number(next.delayMinutes) || 0;
            await CampaignRecipientModel.updateOne(
              { _id: recipient._id, userId: recipient.userId },
              {
                $set: {
                  status: "QUEUED",
                  currentStepId: String(next.id ?? `step-${currentIndex + 2}`),
                  nextActionAt: new Date(Date.now() + delayMinutes * 60_000),
                },
              },
            );
          }
        }
      } catch (error) {
        logger.error({ err: error, recipientId: String(recipient._id) }, "Scheduled campaign recipient failed");
      }

      const remaining = await CampaignRecipientModel.exists({
        campaignId: recipient.campaignId,
        userId,
        status: { $in: ["QUEUED", "ACTIVE", "WAITING"] },
      });
      if (!remaining) {
        await CampaignModel.updateOne(
          { _id: recipient.campaignId, userId: recipient.userId },
          { $set: { status: "COMPLETED" } },
        );
      } else {
        await CampaignModel.updateOne(
          { _id: recipient.campaignId, userId: recipient.userId, status: "SCHEDULED" },
          { $set: { status: "SENDING" } },
        );
      }
    }
}

export async function processDueCampaignRecipients() {
  if (running) return;
  running = true;
  try {
    const users = await UserModel.find({ active: { $ne: false } }).select("_id").lean();
    for (const user of users) {
      const userId = user._id as mongoose.Types.ObjectId;
      await runWithTenant(String(userId), () => processDueCampaignRecipientsForTenant(userId));
    }
  } finally {
    running = false;
  }
}

export function startCampaignWorker() {
  const interval = setInterval(() => {
    processDueCampaignRecipients().catch((error) =>
      logger.error({ err: error }, "Campaign worker iteration failed"),
    );
  }, 5_000);
  interval.unref();
  return interval;
}