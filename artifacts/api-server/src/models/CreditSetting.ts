import { Schema, model, type InferSchemaType } from "mongoose";

const creditSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, default: "messageRates" },
    authenticationRate: { type: Number, required: true, min: 1, default: 1 },
    utilityRate: { type: Number, required: true, min: 1, default: 1 },
    marketingRate: { type: Number, required: true, min: 1, default: 3 },
  },
  { timestamps: true, collection: "creditsettings" },
);

export type CreditSetting = InferSchemaType<typeof creditSettingSchema>;
export const CreditSettingModel = model("CreditSetting", creditSettingSchema);