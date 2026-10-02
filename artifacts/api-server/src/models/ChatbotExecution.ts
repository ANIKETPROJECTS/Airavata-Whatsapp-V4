import { InferSchemaType, Schema } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const chatbotExecutionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    flowId: { type: Schema.Types.ObjectId, ref: "ChatbotFlow", required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    sourceMessageId: { type: String },
    triggerType: {
      type: String,
      enum: ["KEYWORD", "DEFAULT", "TEMPLATE_LINK", "LEGACY_SESSION"],
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "INTERRUPTED", "STOPPED", "FAILED"],
      default: "ACTIVE",
      required: true,
    },
    startedAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

chatbotExecutionSchema.index({ userId: 1, flowId: 1, startedAt: -1, _id: -1 });
chatbotExecutionSchema.index({ sourceMessageId: 1 }, { unique: true, sparse: true });

export const ChatbotExecutionModel = tenantModel<InferSchemaType<typeof chatbotExecutionSchema>>(
  "ChatbotExecution",
  chatbotExecutionSchema,
);