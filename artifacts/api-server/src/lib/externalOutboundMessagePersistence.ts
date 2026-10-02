import { normalizeContactPhone } from "./contactPhone";

export interface ContactReference {
  id: string;
}

export interface StoredOutboundMessage {
  id: string;
  contactId: string;
  status: string;
}

export interface NewOutboundMessage {
  contactId: string;
  externalMessageId: string;
  whatsappMessageId: string;
  direction: "OUTBOUND";
  status: "SENT";
  body: string;
  sentAt: Date;
  mediaType?: "image" | "document" | "video" | "audio";
  mediaUrl?: string;
  mediaId?: string;
  mediaFilename?: string;
}

export interface ExternalOutboundMessageStore {
  findMessageByWhatsAppId(id: string): Promise<StoredOutboundMessage | null>;
  findContactByPhone(phone: string): Promise<ContactReference | null>;
  createContact(phone: string): Promise<{ contact: ContactReference; created: boolean }>;
  createOutboundMessage(message: NewOutboundMessage): Promise<StoredOutboundMessage>;
}

export interface ExternalOutboundMessageInput {
  whatsappMessageId: string;
  recipientPhone: string;
  body: string;
  sentAt: Date;
  mediaType?: "image" | "document" | "video" | "audio";
  mediaUrl?: string;
  mediaId?: string;
  mediaFilename?: string;
}

export interface ExternalOutboundMessageResult {
  message: StoredOutboundMessage;
  created: boolean;
  contactCreated: boolean;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function persistExternalOutboundMessage(
  input: ExternalOutboundMessageInput,
  store: ExternalOutboundMessageStore,
): Promise<ExternalOutboundMessageResult> {
  const existing = await store.findMessageByWhatsAppId(input.whatsappMessageId);
  if (existing) return { message: existing, created: false, contactCreated: false };

  const recipientPhone = normalizeContactPhone(input.recipientPhone);
  let contact = await store.findContactByPhone(recipientPhone);
  let contactCreated = false;

  if (!contact) {
    try {
      const result = await store.createContact(recipientPhone);
      contact = result.contact;
      contactCreated = result.created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      contact = await store.findContactByPhone(recipientPhone);
      if (!contact) throw error;
    }
  }

  if (!contact) throw new Error("Unable to create or find the Live Chat contact");

  try {
    const message = await store.createOutboundMessage({
      contactId: contact.id,
      externalMessageId: input.whatsappMessageId,
      whatsappMessageId: input.whatsappMessageId,
      direction: "OUTBOUND",
      status: "SENT",
      body: input.body,
      sentAt: input.sentAt,
      ...(input.mediaType ? { mediaType: input.mediaType } : {}),
      ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
      ...(input.mediaId ? { mediaId: input.mediaId } : {}),
      ...(input.mediaFilename ? { mediaFilename: input.mediaFilename } : {}),
    });
    return { message, created: true, contactCreated };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const duplicate = await store.findMessageByWhatsAppId(input.whatsappMessageId);
    if (!duplicate) throw error;
    return { message: duplicate, created: false, contactCreated: false };
  }
}