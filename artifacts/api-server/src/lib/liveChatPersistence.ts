import mongoose from "mongoose";
import { ContactModel } from "../models/Contact";
import { enrollNewContactsInTriggerCampaigns } from "./triggerEnrollment";
import { emitContactCreatedEvent } from "./clientWebhooks";
import { normalizeContactPhone, sameContactPhone } from "./contactPhone";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function findContactIdForPhone(
  userId: mongoose.Types.ObjectId,
  phone: string,
): Promise<string | null> {
  const normalizedPhone = normalizeContactPhone(phone);
  const contacts = await ContactModel.find({ userId }).select("_id phone").lean();
  const contact = contacts.find((candidate) =>
    sameContactPhone(candidate.phone, normalizedPhone),
  );
  return contact ? String(contact._id) : null;
}

export async function findOrCreateContactForPhone(
  userId: mongoose.Types.ObjectId,
  phone: string,
  options: {
    enrollInTriggerCampaigns?: boolean;
    emitContactCreatedEvent?: boolean;
  } = {},
): Promise<{ contactId: string; created: boolean }> {
  const normalizedPhone = normalizeContactPhone(phone);
  const existingContactId = await findContactIdForPhone(userId, normalizedPhone);
  if (existingContactId) return { contactId: existingContactId, created: false };

  let result: { contactId: string; created: boolean };
  try {
    const contact = await ContactModel.create({
      userId,
      phone: normalizedPhone,
      name: normalizedPhone,
    });
    result = { contactId: String(contact._id), created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const racedContactId = await findContactIdForPhone(userId, normalizedPhone);
    if (!racedContactId) throw error;
    result = { contactId: racedContactId, created: false };
  }

  if (result.created) {
    const contactId = new mongoose.Types.ObjectId(result.contactId);
    if (options.enrollInTriggerCampaigns !== false) {
      await enrollNewContactsInTriggerCampaigns(userId, [contactId]);
    }
    if (options.emitContactCreatedEvent !== false) {
      void emitContactCreatedEvent(userId, contactId);
    }
  }
  return result;
}