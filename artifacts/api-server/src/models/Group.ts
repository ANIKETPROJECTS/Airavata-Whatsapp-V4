import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const groupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

export type Group = InferSchemaType<typeof groupSchema>;

export const GroupModel = tenantModel<InferSchemaType<typeof groupSchema>>("Group", groupSchema);
