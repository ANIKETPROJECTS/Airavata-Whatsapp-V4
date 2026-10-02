import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const waPaySettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gateway: { type: String, enum: ["razorpay"], default: "razorpay", required: true },
    configurationName: { type: String, required: true, trim: true, maxlength: 60 },
    paymentConfigId: { type: String, trim: true, default: null, maxlength: 128 },
  },
  { timestamps: true },
);

waPaySettingsSchema.index({ userId: 1 }, { unique: true });

export type WaPaySettingsRecord = InferSchemaType<typeof waPaySettingsSchema>;

export const WaPaySettingsModel = tenantModel<WaPaySettingsRecord>(
  "WaPaySettings",
  waPaySettingsSchema,
);