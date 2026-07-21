import { Schema, model, type InferSchemaType } from "mongoose";

const attributeItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { _id: true },
);

const attributesSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    attributes: { type: [attributeItemSchema], default: [] },
  },
  { timestamps: true },
);

export type AttributeDoc = InferSchemaType<typeof attributesSchema>;
export const AttributeModel = model("Attribute", attributesSchema);
