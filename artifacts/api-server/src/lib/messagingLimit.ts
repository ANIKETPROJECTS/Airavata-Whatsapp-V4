import mongoose from "mongoose";
import { MessageModel } from "../models/Message";
import { UserModel } from "../models/User";
import { getCredentials } from "./whatsapp";
import { logger } from "./logger";

const GRAPH_BASE = "https://graph.facebook.com/v22.0";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const SAFETY_RATIO = 0.9;

type StoredUserLimit = {
  whatsappMessagingLimitTier?: string;
  whatsappMessagingLimit?: number;
  whatsappMessagingLimitFetchedAt?: Date;
  timezone?: string;
};

export type MessagingLimitSnapshot = {
  tier?: string;
  limit?: number | null;
  fetchedAt?: Date;
};

export type MessagingLimitCheck =
  | { allowed: true; uniqueContactsMessagedToday: number; snapshot: MessagingLimitSnapshot }
  | {
      allowed: false;
      uniqueContactsMessagedToday: number;
      limit: number;
      threshold: number;
      resumeAt: Date;
      snapshot: MessagingLimitSnapshot;
    };

function parseMessagingLimitTier(value: string | undefined): number | null | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("UNLIMITED")) return null;

  const match = normalized.match(/(?:TIER[_-]?)?([\d,.]+)\s*([KMB])?/);
  if (!match?.[1]) return undefined;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return undefined;
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  return numeric * multiplier;
}

async function fetchLimitFromMeta(userId: string): Promise<MessagingLimitSnapshot> {
  const { phoneNumberId, accessToken } = await getCredentials(userId, {
    allowEnvFallback: false,
  });
  const response = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=whatsapp_business_manager_messaging_limit,messaging_limit_tier`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const payload = await response.json() as {
    whatsapp_business_manager_messaging_limit?: string;
    messaging_limit_tier?: string;
    error?: { message?: string };
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Meta phone number lookup failed (${response.status})`);
  }

  const tier =
    payload.whatsapp_business_manager_messaging_limit ??
    payload.messaging_limit_tier;
  const limit = parseMessagingLimitTier(tier);
  const fetchedAt = new Date();
  await UserModel.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        ...(tier ? { whatsappMessagingLimitTier: tier } : {}),
        ...(limit === undefined ? {} : { whatsappMessagingLimit: limit }),
        whatsappMessagingLimitFetchedAt: fetchedAt,
      },
    },
  );
  return { tier, limit, fetchedAt };
}

async function getStoredLimit(userId: string): Promise<StoredUserLimit | null> {
  return UserModel.findById(userId)
    .select("whatsappMessagingLimitTier whatsappMessagingLimit whatsappMessagingLimitFetchedAt timezone")
    .lean();
}

export async function getWhatsAppMessagingLimit(userId: string): Promise<MessagingLimitSnapshot> {
  const stored = await getStoredLimit(userId);
  const fetchedAt = stored?.whatsappMessagingLimitFetchedAt;
  if (fetchedAt && Date.now() - fetchedAt.getTime() < REFRESH_INTERVAL_MS) {
    return {
      tier: stored?.whatsappMessagingLimitTier,
      limit: stored?.whatsappMessagingLimit,
      fetchedAt,
    };
  }

  try {
    return await fetchLimitFromMeta(userId);
  } catch (error) {
    logger.warn(
      { err: error, userId },
      "Unable to refresh WhatsApp messaging limit; using stored limit",
    );
    return {
      tier: stored?.whatsappMessagingLimitTier,
      limit: stored?.whatsappMessagingLimit,
      fetchedAt,
    };
  }
}

function getTenantDayBounds(timezone: string | undefined): { start: Date; nextStart: Date } {
  const now = new Date();
  const safeTimezone = timezone || "UTC";
  let parts: Record<string, number>;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    parts = Object.fromEntries(
      formatter.formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
  } catch {
    parts = {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      second: now.getUTCSeconds(),
    };
  }

  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = localAsUtc - now.getTime();
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
  const nextStart = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1) - offset);
  return { start, nextStart };
}

async function checkMessagingLimitBeforeSendInternal(
  userId: string,
  contactId: mongoose.Types.ObjectId | string,
): Promise<MessagingLimitCheck> {
  const snapshot = await getWhatsAppMessagingLimit(userId);
  if (snapshot.limit === undefined || snapshot.limit === null) {
    return { allowed: true, uniqueContactsMessagedToday: 0, snapshot };
  }

  const stored = await getStoredLimit(userId);
  const { start, nextStart } = getTenantDayBounds(stored?.timezone);
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const sentContactIds = await MessageModel.distinct("contactId", {
    userId: userObjectId,
    direction: "OUTBOUND",
    status: { $in: ["SENT", "DELIVERED", "READ"] },
    $or: [
      { sentAt: { $gte: start } },
      { sentAt: { $exists: false }, createdAt: { $gte: start } },
    ],
  });
  const uniqueContactIds = new Set(sentContactIds.map((id) => String(id)));
  const contactAlreadyMessagedToday = uniqueContactIds.has(String(contactId));
  const threshold = Math.max(1, Math.floor(snapshot.limit * SAFETY_RATIO));

  if (contactAlreadyMessagedToday || uniqueContactIds.size < threshold) {
    return {
      allowed: true,
      uniqueContactsMessagedToday: uniqueContactIds.size,
      snapshot,
    };
  }

  return {
    allowed: false,
    uniqueContactsMessagedToday: uniqueContactIds.size,
    limit: snapshot.limit,
    threshold,
    resumeAt: nextStart,
    snapshot,
  };
}

export async function checkMessagingLimitBeforeSend(
  userId: string,
  contactId: mongoose.Types.ObjectId | string,
): Promise<MessagingLimitCheck> {
  try {
    return await checkMessagingLimitBeforeSendInternal(userId, contactId);
  } catch (error) {
    // A limit lookup failure must not strand a claimed recipient in ACTIVE.
    // The worker will continue with normal provider-side handling and logs the
    // failure for repair instead of silently suppressing tenant sends.
    logger.warn(
      { err: error, userId, contactId: String(contactId) },
      "Messaging limit safeguard unavailable; allowing campaign send",
    );
    return {
      allowed: true,
      uniqueContactsMessagedToday: 0,
      snapshot: {},
    };
  }
}