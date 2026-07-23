import { Schema, model, type InferSchemaType } from "mongoose";

const templateButtonSchema = new Schema(
  {
    type: { type: String, enum: ["QUICK_REPLY", "URL", "PHONE_NUMBER", "FLOW"], required: true },
    text: { type: String, required: true },
    value: { type: String },
    // FLOW button fields
    flowId: { type: String },       // Meta flow ID (metaFlowId)
    flowName: { type: String },     // display label
    navigateScreen: { type: String }, // first screen ID to navigate to
  },
  { _id: false },
);

const templateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ["MARKETING", "UTILITY", "AUTHENTICATION"], required: true },
    language: { type: String, default: "en_US" },
    headerType: { type: String, enum: ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"], default: "NONE" },
    headerContent: { type: String },
    body: { type: String, required: true },
    footer: { type: String },
    buttons: [templateButtonSchema],
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    rejectionReason: { type: String },
    metaTemplateId: { type: String },
  },
  { timestamps: true },
);

export type Template = InferSchemaType<typeof templateSchema>;

export const TemplateModel = model("Template", templateSchema);
