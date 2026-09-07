import { createHmac, randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { ContactModel } from "../models/Contact";
import { CLIENT_WEBHOOK_EVENTS, WebhookModel } from "../models/Webhook";
import { runWithTenant } from "./tenantDatabase";
import { logger } from "./logger";

export type ClientWebhookEvent = (typeof CLIENT_WEBHOOK_EVENTS)[number];

type JsonRecord = Record<string, unknown>;

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_DELIVERY_ATTEMPTS = 3;

function objectId(value: mongoose.Types.ObjectId | string) {
  return new mongoose.Types.ObjectId(String(value));
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function deliverToWebhook(
  webhook: { _id: unknown; url: string; secret: string },
  event: ClientWebhookEvent,
  eventId: string,
  payload: string,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", webhook.secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  let lastError = "Unknown webhook delivery error";
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    logger.info(
      {
        webhookId: String(webhook._id),
        event,
        url: webhook.url,
        eventId,
        attempt,
        maxAttempts: MAX_DELIVERY_ATTEMPTS,
      },
      "Client webhook delivery attempt started",
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Airavata-Webhook/1.0",
          "X-Airavata-Webhook-Id": eventId,
          "X-Airavata-Webhook-Event": event,
          "X-Airavata-Webhook-Timestamp": timestamp,
          "X-Airavata-Webhook-Signature": `sha256=${signature}`,
        },
        body: payload,
        signal: controller.signal,
      });
      if (response.ok) {
        logger.info(
          {
            webhookId: String(webhook._id),
            event,
            url: webhook.url,
            eventId,
            attempt,
            status: response.status,
            durationMs: Date.now() - startedAt,
          },
          "Client webhook delivered",
        );
        return;
      }
      lastError = `HTTP ${response.status}`;
      logger.warn(
        {
          webhookId: String(webhook._id),
          event,
          url: webhook.url,
          eventId,
          attempt,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        "Client webhook delivery returned a non-success response",
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(
        {
          err: error,
          webhookId: String(webhook._id),
          event,
          url: webhook.url,
          eventId,
          attempt,
          durationMs: Date.now() - startedAt,
        },
        "Client webhook delivery attempt failed",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  logger.warn(
    {
      webhookId: String(webhook._id),
      event,
      url: webhook.url,
      attempts: MAX_DELIVERY_ATTEMPTS,
      error: lastError,
    },
    "Client webhook delivery failed",
  );
}

async function deliverEventInTenant(
  userId: string,
  event: ClientWebhookEvent,
  data: JsonRecord,
): Promise<void> {
  const tenantUserId = objectId(userId);
  logger.info(
    { userId: String(tenantUserId), event },
    "Looking up client webhooks for tenant",
  );
  const webhooks = await WebhookModel.find({
    userId: tenantUserId,
    isActive: true,
    events: event,
  })
    .select("+secret")
    .lean();

  logger.info(
    {
      userId: String(tenantUserId),
      event,
      webhookCount: webhooks.length,
      webhookIds: webhooks.map((webhook) => String(webhook._id)),
    },
    "Client webhook lookup completed",
  );

  if (webhooks.length === 0) {
    logger.info(
      { userId: String(tenantUserId), event },
      "No active client webhooks are registered for this tenant event",
    );
    return;
  }

  const eventId = randomUUID();
  const payload = JSON.stringify({
    id: eventId,
    event,
    createdAt: new Date().toISOString(),
    data,
  });

  await Promise.all(
    webhooks.map((webhook) =>
      deliverToWebhook(
        { _id: webhook._id, url: webhook.url, secret: webhook.secret },
        event,
        eventId,
        payload,
      ),
    ),
  );
}

/**
 * Delivering a client webhook is deliberately best-effort and detached from
 * the business operation that produced the event. A receiver outage must not
 * make contact creation or inbound WhatsApp processing fail.
 */
export async function emitClientWebhookEvent(
  userId: mongoose.Types.ObjectId | string,
  event: ClientWebhookEvent,
  data: JsonRecord,
): Promise<void> {
  logger.info(
    { userId: String(userId), event },
    "Client webhook event dispatch requested",
  );
  try {
    await runWithTenant(String(userId), () =>
      deliverEventInTenant(String(userId), event, data),
    );
  } catch (error) {
    logger.warn(
      { err: error, userId: String(userId), event },
      "Client webhook event could not be dispatched",
    );
    return;
  }
  logger.info(
    { userId: String(userId), event },
    "Client webhook event dispatch finished",
  );
}

export async function emitContactCreatedEvent(
  userId: mongoose.Types.ObjectId | string,
  contactId: mongoose.Types.ObjectId | string,
): Promise<void> {
  try {
    await runWithTenant(String(userId), async () => {
      const contact = await ContactModel.findOne({
        _id: objectId(contactId),
        userId: objectId(userId),
      })
        .select("_id name phone email status attributes tags groupId createdAt")
        .lean();
      if (!contact) return;

      await deliverEventInTenant(String(userId), "contact_created", {
        contact: {
          id: String(contact._id),
          name: contact.name,
          phone: contact.phone,
          email: contact.email ?? null,
          status: contact.status,
          attributes: contact.attributes ?? {},
          createdAt: contact.createdAt,
        },
      });
    });
  } catch (error) {
    logger.warn(
      { err: error, userId: String(userId), contactId: String(contactId) },
      "Contact-created webhook event could not be dispatched",
    );
  }
}

export async function emitContactCreatedEvents(
  userId: mongoose.Types.ObjectId | string,
  contactIds: Array<mongoose.Types.ObjectId | string>,
): Promise<void> {
  await Promise.allSettled(
    contactIds.map((contactId) => emitContactCreatedEvent(userId, contactId)),
  );
}