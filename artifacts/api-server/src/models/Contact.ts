import { Schema, model, type InferSchemaType } from "mongoose";

const contactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
    groupId: { type: Schema.Types.ObjectId, ref: "Group" },
    lastContactedAt: { type: Date },
    status: { type: String, enum: ["active", "blocked", "unsubscribed"], default: "active" },
    chatState: { type: String, enum: ["DOR", "REQ", "CLOSED", "ACTIVE"], default: "DOR" },
    // Chatbot engine session — tracks which flow node the contact is currently at
    chatbotSession: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

contactSchema.index({ userId: 1, phone: 1 }, { unique: true });

export type Contact = InferSchemaType<typeof contactSchema>;

export const ContactModel = model("Contact", contactSchema);
