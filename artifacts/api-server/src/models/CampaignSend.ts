import { Schema, model, type InferSchemaType } from "mongoose";

const campaignSendSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "CampaignRecipient", required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    stepId: { type: String, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: "Template", required: true },
    idempotencyKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["RESERVED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"],
      default: "RESERVED",
      index: true,
    },
    whatsappMessageId: { type: String, index: true },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    failureReason: { type: String },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    creditAmount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

campaignSendSchema.index({ campaignId: 1, contactId: 1, stepId: 1 }, { unique: true });
campaignSendSchema.index({ userId: 1, status: 1, nextRetryAt: 1 });

export type CampaignSend = InferSchemaType<typeof campaignSendSchema>;
export const CampaignSendModel = model("CampaignSend", campaignSendSchema);