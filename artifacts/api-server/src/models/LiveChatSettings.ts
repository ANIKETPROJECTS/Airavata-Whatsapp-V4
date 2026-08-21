import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const daySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    open: { type: String, default: "09:00" },
    close: { type: String, default: "17:00" },
  },
  { _id: false },
);

const liveChatSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    offHoursEnabled: { type: Boolean, default: false },
    offHoursMessage: { type: String, default: "We are currently outside our working hours. We will get back to you soon!" },
    timezone: { type: String, default: "Asia/Calcutta" },
    workingHours: {
      mon: { type: daySchema, default: () => ({}) },
      tue: { type: daySchema, default: () => ({}) },
      wed: { type: daySchema, default: () => ({}) },
      thu: { type: daySchema, default: () => ({}) },
      fri: { type: daySchema, default: () => ({}) },
      sat: { type: daySchema, default: () => ({}) },
      sun: { type: daySchema, default: () => ({}) },
    },
  },
  { timestamps: true },
);

export type LiveChatSettings = InferSchemaType<typeof liveChatSettingsSchema>;
export const LiveChatSettingsModel = tenantModel<InferSchemaType<typeof liveChatSettingsSchema>>("LiveChatSettings", liveChatSettingsSchema);
