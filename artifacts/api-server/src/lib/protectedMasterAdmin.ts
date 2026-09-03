/**
 * The original Airavata operator account is managed through the ecosystem
 * configuration rather than Facebook Embedded Signup.
 *
 * This module exposes only account matching and non-secret credential IDs.
 * The access token is read by whatsapp.ts only when an outbound request needs it.
 */

export const PROTECTED_MASTER_ADMIN_EMAIL = "raneaniket23@gmail.com";

type ProtectedUser = {
  email?: string | null;
  isProtectedMasterAdmin?: boolean | null;
};

export function isProtectedMasterAdminUser(user: ProtectedUser | null | undefined): boolean {
  return Boolean(
    user?.isProtectedMasterAdmin ||
      user?.email?.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL,
  );
}

export function getEcosystemWhatsAppCredentialIds(): {
  wabaId: string | null;
  phoneNumberId: string | null;
} {
  return {
    wabaId: process.env["META_WABA_ID"] ?? null,
    phoneNumberId: process.env["META_PHONE_NUMBER_ID"] ?? null,
  };
}

export function getEcosystemWhatsAppCredentials(): {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
} {
  const wabaId = process.env["META_WABA_ID"];
  const phoneNumberId = process.env["META_PHONE_NUMBER_ID"];
  const accessToken = process.env["META_ACCESS_TOKEN"];
  if (!wabaId || !phoneNumberId || !accessToken) {
    throw new Error(
      "Ecosystem WhatsApp credentials are not configured. Set META_WABA_ID, META_PHONE_NUMBER_ID, and META_ACCESS_TOKEN.",
    );
  }
  return { wabaId, phoneNumberId, accessToken };
}