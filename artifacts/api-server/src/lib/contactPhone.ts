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

/**
 * Normalize a phone number for an outbound campaign and reject malformed
 * Indian numbers before they reach Meta. The campaign UI currently operates
 * primarily on Indian recipients, where the canonical format is +91 followed
 * by exactly 10 subscriber digits.
 */
export function normalizeCampaignPhone(value: unknown): string {
  const normalized = normalizeContactPhone(value);
  const digits = normalized.slice(1);
  if (digits.startsWith(DEFAULT_CONTACT_COUNTRY_CODE) && digits.length !== 12) {
    throw new Error(
      "Indian WhatsApp numbers must contain country code 91 followed by 10 digits",
    );
  }
  return normalized;
}

export function tryNormalizeContactPhone(value: unknown): string | null {
  try {
    return normalizeContactPhone(value);
  } catch {
    return null;
  }
}

export function sameContactPhone(left: unknown, right: unknown): boolean {
  const normalizedLeft = tryNormalizeContactPhone(left);
  const normalizedRight = tryNormalizeContactPhone(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function contactPhoneDigits(value: unknown): string {
  return normalizeContactPhone(value).slice(1);
}