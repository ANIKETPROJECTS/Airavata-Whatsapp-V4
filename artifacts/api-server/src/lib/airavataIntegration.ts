import { logger } from "./logger";

const DEFAULT_INQUIRY_ENDPOINT =
  "https://newcrm.autogamma.in/api/integrations/airavata/whatsapp-inquiries";

export interface AiravataInquiryCreatedEvent {
  eventType: "inquiry.created";
  eventId: string;
  sourceSystem: "airavata";
  source: "whatsapp";
  externalInquiryId: string;
  customer: {
    name: string;
    phone: string;
    whatsappContactName: string;
  };
  vehicle: {
    model: string;
    category: string;
  };
  service: {
    name: string;
    currency: "INR";
  };
  appointment?: {
    timezone: string;
    notes: string;
  };
  stage: "NEW";
  references: {
    airavataContactId: string;
  };
  occurredAt: string;
}

/**
 * Sends the first inbound message for a WhatsApp contact to AutoGamma.
 *
 * This integration is deliberately best-effort: Meta has already received its
 * webhook acknowledgement by the time this is called, so a receiver outage
 * must not cause Meta to retry the WhatsApp message.
 */
export async function sendInquiryCreated(
  event: AiravataInquiryCreatedEvent,
): Promise<void> {
  // Secrets pasted from another Repl can carry an accidental trailing newline
  // or surrounding spaces. The receiver compares the key exactly.
  const secret = process.env.AIRAVATA_INTEGRATION_SECRET?.trim();
  if (!secret) {
    logger.warn("AIRAVATA_INTEGRATION_SECRET is not configured; skipping AutoGamma inquiry event");
    return;
  }

  const endpoint =
    process.env.AIRAVATA_INTEGRATION_URL ?? DEFAULT_INQUIRY_ENDPOINT;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Airavata-Integration-Key": secret,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error(
        {
          status: response.status,
          response: responseBody.slice(0, 500),
          eventId: event.eventId,
        },
        "AutoGamma inquiry event was rejected",
      );
      return;
    }

    const result = (await response.json().catch(() => null)) as
      | { accepted?: boolean; duplicate?: boolean; inquiryId?: string }
      | null;
    logger.info(
      {
        eventId: event.eventId,
        accepted: result?.accepted,
        duplicate: result?.duplicate,
        inquiryId: result?.inquiryId,
      },
      "AutoGamma inquiry event delivered",
    );
  } catch (err) {
    logger.error(
      { err: String(err), eventId: event.eventId },
      "AutoGamma inquiry event delivery failed",
    );
  }
}