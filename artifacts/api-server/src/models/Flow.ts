import { Schema, model, type InferSchemaType } from "mongoose";

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
    // For TextInput sub-type
    inputType: { type: String, default: "text" },
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
export const FlowModel = model("Flow", flowSchema);
