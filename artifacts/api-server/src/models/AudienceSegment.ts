import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const audienceSegmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    filter: { type: Schema.Types.Mixed, required: true },
    estimatedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

audienceSegmentSchema.index({ userId: 1, name: 1 }, { unique: true });
audienceSegmentSchema.index({ userId: 1, updatedAt: -1 });

export type AudienceSegment = InferSchemaType<typeof audienceSegmentSchema>;
export const AudienceSegmentModel = tenantModel<InferSchemaType<typeof audienceSegmentSchema>>("AudienceSegment", audienceSegmentSchema);