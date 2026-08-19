import { Schema, model, type InferSchemaType } from "mongoose";

const creditSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: "creditsettings" },
);

export type CreditSetting = InferSchemaType<typeof creditSettingSchema>;
export const CreditSettingModel = model("CreditSetting", creditSettingSchema);