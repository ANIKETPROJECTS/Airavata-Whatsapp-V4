import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

export const CLIENT_WEBHOOK_EVENTS = [
  "contact_created",
  "message_received",
  "message_delivered",
  "campaign_completed",
] as const;

const webhookSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true, trim: true },
    events: {
      type: [String],
      enum: CLIENT_WEBHOOK_EVENTS,
      required: true,
      validate: {
        validator: (events: string[]) => events.length > 0,
        message: "At least one webhook event is required",
      },
    },
    isActive: { type: Boolean, default: true, index: true },
    // Never expose this field in list responses. It is only selected by the
    // outbound delivery service when it signs a request.
    secret: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

webhookSchema.index({ userId: 1, isActive: 1, events: 1 });

export type Webhook = InferSchemaType<typeof webhookSchema>;
export const WebhookModel = tenantModel<InferSchemaType<typeof webhookSchema>>(
  "Webhook",
  webhookSchema,
);