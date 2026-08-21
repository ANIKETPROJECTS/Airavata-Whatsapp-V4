import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["MESSAGE", "DELIVERY", "CAMPAIGN", "TEMPLATE", "SYSTEM"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ["INFO", "SUCCESS", "WARNING", "ERROR"],
      default: "INFO",
    },
    dedupeKey: { type: String, required: true, index: true },
    actionUrl: { type: String },
    metadata: { type: Schema.Types.Mixed },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export type Notification = InferSchemaType<typeof notificationSchema>;

export const NotificationModel = tenantModel<InferSchemaType<typeof notificationSchema>>(
  "Notification",
  notificationSchema,
);