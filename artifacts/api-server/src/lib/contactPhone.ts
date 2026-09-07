/**
 * Canonical phone format for contacts: +<country-code><subscriber-number>.
 *
 * Airavata currently operates with India as the default workspace country, so
 * local 10-digit numbers and 0-prefixed 11-digit numbers receive +91.
 * Explicit international numbers keep their supplied country code.
 */
export const DEFAULT_CONTACT_COUNTRY_CODE = "91";

export function normalizeContactPhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Phone number is required");

  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Local Indian formats: 9876543210 and 09876543210.
  if (digits.length === 10) {
    digits = `${DEFAULT_CONTACT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `${DEFAULT_CONTACT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  if (!/^\d{7,15}$/.test(digits)) {
    throw new Error("Phone number must include a country code and contain 7 to 15 digits");
  }

  return `+${digits}`;
}

export function tryNormalizeContactPhone(value: unknown): string | null {
  try {
    return normalizeContactPhone(value);
  } catch {
    return null;
  }
}

export function contactPhoneDigits(value: unknown): string {
  return normalizeContactPhone(value).slice(1);
}