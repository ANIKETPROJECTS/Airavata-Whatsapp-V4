import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const nodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    position: { x: Number, y: Number },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const edgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    label: { type: String },
    animated: { type: Boolean, default: false },
  },
  { _id: false },
);

const versionSchema = new Schema(
  {
    version: { type: Number, required: true },
    nodes: [nodeSchema],
    edges: [edgeSchema],
    savedAt: { type: Date, default: Date.now },
    label: { type: String },
  },
  { _id: false },
);

const chatbotFlowSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, default: "Untitled Flow" },
    status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" },
    nodes: [nodeSchema],
    edges: [edgeSchema],
    version: { type: Number, default: 1 },
    history: { type: [versionSchema], default: [] },
    variables: { type: [{ name: String, type: String, defaultValue: String }], default: [] },
    analytics: {
      triggered: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export const ChatbotFlowModel = tenantModel<InferSchemaType<typeof chatbotFlowSchema>>("ChatbotFlow", chatbotFlowSchema);
