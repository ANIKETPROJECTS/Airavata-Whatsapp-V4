import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const messageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
    direction: { type: String, enum: ["OUTBOUND", "INBOUND"], required: true },
    body: { type: String },
    mediaType: { type: String }, // "image" | "document" | "video" | "audio"
    mediaUrl: { type: String },  // public URL from Meta (for display)
    mediaId: { type: String },   // Meta media object ID
    mediaFilename: { type: String },
    templateId: { type: Schema.Types.ObjectId, ref: "Template" },
    whatsappMessageId: { type: String, index: true },
    externalMessageId: { type: String },
    externalRequestHash: { type: String },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"],
      default: "QUEUED",
    },
    failureReason: { type: String },
    metaErrorCode: { type: Number },
    metaErrorTitle: { type: String },
    metaErrorDetails: { type: String },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    // WhatsApp Flow response data (populated when type = interactive/nfm_reply)
    flowData: { type: Schema.Types.Mixed },
    flowId: { type: Schema.Types.ObjectId, ref: "Flow" },
  },
  { timestamps: true },
);

// Only externally ingested messages set this field. Its sparse unique index
// makes concurrent AutoGamma retries atomic without changing legacy messages.
messageSchema.index({ externalMessageId: 1 }, { unique: true, sparse: true });

export type Message = InferSchemaType<typeof messageSchema>;

export const MessageModel = tenantModel<InferSchemaType<typeof messageSchema>>("Message", messageSchema);
