import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const apiKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "Default Key" },
    keyHash: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

export type ApiKey = InferSchemaType<typeof apiKeySchema>;

export const ApiKeyModel = tenantModel<InferSchemaType<typeof apiKeySchema>>("ApiKey", apiKeySchema);
