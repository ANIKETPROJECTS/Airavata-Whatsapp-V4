import { Schema, model, type InferSchemaType } from "mongoose";

const agentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: ["agent", "supervisor", "admin"], default: "agent" },
    permissions: {
      liveChat: { type: Boolean, default: true },
      campaigns: { type: Boolean, default: false },
      contacts: { type: Boolean, default: true },
      templates: { type: Boolean, default: false },
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

export type Agent = InferSchemaType<typeof agentSchema>;
export const AgentModel = model("Agent", agentSchema);
