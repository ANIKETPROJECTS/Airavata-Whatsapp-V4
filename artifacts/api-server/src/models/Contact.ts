import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const contactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    attributes: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    groupId: { type: Schema.Types.ObjectId, ref: "Group" },
    groupIds: [{ type: Schema.Types.ObjectId, ref: "Group" }],
    lastContactedAt: { type: Date },
    status: { type: String, enum: ["active", "blocked", "unsubscribed"], default: "active" },
    chatState: { type: String, enum: ["DOR", "REQ", "CLOSED", "ACTIVE"], default: "DOR" },
    // Timestamp through which an agent has read inbound messages in Live Chat.
    // Unread counts are derived from messages after this point.
    lastReadAt: { type: Date },
    // Chatbot engine session — tracks which flow node the contact is currently at
    chatbotSession: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

contactSchema.index({ userId: 1, phone: 1 }, { unique: true });

export type Contact = InferSchemaType<typeof contactSchema>;

export const ContactModel = tenantModel<InferSchemaType<typeof contactSchema>>("Contact", contactSchema);
