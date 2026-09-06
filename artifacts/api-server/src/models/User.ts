import { Schema, model, type InferSchemaType } from "mongoose";
const userSchema = new Schema(
  {
    businessName: { type: String, required: true, trim: true },
    tenantDatabaseName: { type: String, trim: true, unique: true, sparse: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    isProtectedMasterAdmin: { type: Boolean, default: false, index: true },
    phone: { type: String, trim: true },
    // Date-only business field; keep it as YYYY-MM-DD to avoid timezone shifts.
    serviceStartDate: { type: String, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    timezone: { type: String, default: "Asia/Kolkata" },
    role: { type: String, enum: ["admin", "client"], default: "client" },
    active: { type: Boolean, default: true, index: true },
    permissions: {
      type: [String],
      default: [
        "dashboard",
        "live-chat",
        "contacts",
        "create-campaign",
        "campaigns-report",
        "add-template",
        "manage-templates",
        "flow-builder",
        "chatbot",
        "integration",
        "group",
        "catalogue",
        "wa-pay",
        "credits",
        "manage",
        "profile",
      ],
    },
    creditBalance: { type: Number, default: 0 },
    metaPhoneNumberId: { type: String, unique: true, sparse: true },
    // Embedded Signup — set when a business connects their WABA via Connect Facebook
    metaWabaConnected: { type: Boolean, default: false },
    metaWabaId: { type: String, unique: true, sparse: true },
    metaWabaAccessToken: { type: String }, // system-user token from Embedded Signup
    metaEmbeddedSignupCode: { type: String }, // fallback: raw code if APP_SECRET not set
  },
  { timestamps: true },
);
export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
