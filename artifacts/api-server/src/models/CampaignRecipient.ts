import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const campaignRecipientSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    status: {
      type: String,
      enum: ["QUEUED", "ACTIVE", "WAITING", "COMPLETED", "FAILED", "SKIPPED", "OPTED_OUT"],
      default: "QUEUED",
      index: true,
    },
    currentStepId: { type: String },
    nextActionAt: { type: Date, index: true },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    lastError: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

campaignRecipientSchema.index({ campaignId: 1, contactId: 1 }, { unique: true });
campaignRecipientSchema.index({ userId: 1, status: 1, nextActionAt: 1 });

export type CampaignRecipient = InferSchemaType<typeof campaignRecipientSchema>;
export const CampaignRecipientModel = tenantModel<InferSchemaType<typeof campaignRecipientSchema>>("CampaignRecipient", campaignRecipientSchema);