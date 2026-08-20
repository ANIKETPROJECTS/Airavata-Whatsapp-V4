import { Schema, model, type InferSchemaType } from "mongoose";

const campaignSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["QUICK", "CSV", "SEGMENT", "FLOW", "DRIP", "TRIGGER"],
      default: "QUICK",
      index: true,
    },
    templateId: { type: Schema.Types.ObjectId, ref: "Template", required: true },
    audience: {
      contactIds: [{ type: Schema.Types.ObjectId, ref: "Contact" }],
      groupIds: [{ type: Schema.Types.ObjectId, ref: "Group" }],
      segmentId: { type: Schema.Types.ObjectId, ref: "AudienceSegment" },
      filter: { type: Schema.Types.Mixed },
      csvImportId: { type: Schema.Types.ObjectId, ref: "CampaignCsvImport" },
    },
    variableValues: { type: Schema.Types.Mixed },
    scheduledAt: { type: Date },
    schedule: { type: Schema.Types.Mixed },
    trigger: { type: Schema.Types.Mixed },
    steps: { type: [Schema.Types.Mixed], default: undefined },
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "SENDING", "COMPLETED", "FAILED"],
      default: "DRAFT",
    },
    stats: {
      totalRecipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    creditCost: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export type Campaign = InferSchemaType<typeof campaignSchema>;

export const CampaignModel = model("Campaign", campaignSchema);
