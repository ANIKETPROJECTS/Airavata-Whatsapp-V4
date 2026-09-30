import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const componentSchema = new Schema(
  {
    type: { type: String, required: true },
    // For heading/body text
    text: { type: String },
    // For input fields
    name: { type: String },
    label: { type: String },
    required: { type: Boolean, default: false },
    // For dropdown / radio / checkbox options
    options: [{ id: String, title: String }],
    // For image
    src: { type: String },
    altText: { type: String },
    scaleType: { type: String, enum: ["contain", "cover"], default: "contain" },
    // For TextInput sub-type
    inputType: { type: String, default: "text" },
    // For links and consent details
    url: { type: String },
    // For photo/document pickers
    description: { type: String },
    photoSource: { type: String, enum: ["camera_gallery", "camera", "gallery"] },
    maxFileSizeKb: { type: Number, min: 1, max: 25600 },
    maxUploadedFiles: { type: Number, min: 1, max: 30 },
    allowedMimeTypes: [{ type: String }],
  },
  { _id: false },
);

const screenSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    isTerminal: { type: Boolean, default: false },
    nextScreenId: { type: String },
    components: [componentSchema],
  },
  { _id: false },
);

const flowSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    categories: [{ type: String }],
    metaFlowId: { type: String },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "DEPRECATED"],
      default: "DRAFT",
    },
    endpointUri: { type: String },
    healthStatus: { type: String },
    validationErrors: { type: Schema.Types.Mixed },
    screens: [screenSchema],
  },
  { timestamps: true },
);

export type Flow = InferSchemaType<typeof flowSchema>;
export const FlowModel = tenantModel<InferSchemaType<typeof flowSchema>>("Flow", flowSchema);
