import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const cannedMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: ["text", "media", "template"], default: "text" },
  },
  { timestamps: true },
);

export type CannedMessage = InferSchemaType<typeof cannedMessageSchema>;
export const CannedMessageModel = tenantModel<InferSchemaType<typeof cannedMessageSchema>>("CannedMessage", cannedMessageSchema);
