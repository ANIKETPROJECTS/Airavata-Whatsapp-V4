import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const pushDeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ["ANDROID", "IOS"], required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

pushDeviceSchema.index({ token: 1 }, { unique: true });
pushDeviceSchema.index({ userId: 1, lastSeenAt: -1 });

export const PushDeviceModel = tenantModel<InferSchemaType<typeof pushDeviceSchema>>(
  "PushDevice",
  pushDeviceSchema,
);
