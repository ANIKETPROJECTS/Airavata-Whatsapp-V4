import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

/**
 * Stores per-user WhatsApp Cloud API credentials.
 * The access token is encrypted at rest using AES-256-GCM (lib/credentialCrypto.ts).
 * Never store the raw token here — always encrypt before saving, decrypt on read.
 */
const whatsAppCredentialSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    wabaId: { type: String, required: true, trim: true },
    phoneNumberId: { type: String, required: true, trim: true },
    /**
     * AES-256-GCM encrypted access token.
     * Stored as a single base64 string: IV (12 bytes) + authTag (16 bytes) + ciphertext.
     */
    accessTokenEncrypted: { type: String, required: true },
    // Tenant-owned Meta Commerce Catalog settings. These are local settings only;
    // catalog discovery/synchronization is intentionally not implemented here.
    metaCatalogId: { type: String, trim: true },
    catalogName: { type: String, trim: true },
    catalogConnected: { type: Boolean, default: false },
    catalogLastSyncedAt: { type: Date },
  },
  { timestamps: true },
);

export type WhatsAppCredential = InferSchemaType<typeof whatsAppCredentialSchema>;
export const WhatsAppCredentialModel = tenantModel<InferSchemaType<typeof whatsAppCredentialSchema>>("WhatsAppCredential", whatsAppCredentialSchema);
