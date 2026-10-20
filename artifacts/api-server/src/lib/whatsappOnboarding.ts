import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { UserModel } from "../models/User";
import { WhatsAppCredentialModel } from "../models/WhatsAppCredential";
import { decryptToken } from "./credentialCrypto";
import { runWithTenant } from "./tenantDatabase";
import { logger } from "./logger";
import {
  decryptOnboardingPin,
  encryptOnboardingPin,
  graphRequest,
  mapOnboardingFailure,
  MetaGraphError,
  sanitizeMetaMessage,
  type GraphRequest,
} from "./whatsappOnboardingPrimitives";
export {
  decryptOnboardingPin,
  encryptOnboardingPin,
  graphRequest,
  mapOnboardingFailure,
  MetaGraphError,
} from "./whatsappOnboardingPrimitives";

const locks = new Map<string, Promise<FinalizeResult>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const statusCache = new Map<string, { expiresAt: number; value: WaLiveStatus }>();
const FIELDS = "status,code_verification_status,name_status,quality_rating,platform_type,messaging_limit_tier,whatsapp_business_manager_messaging_limit";
type MetaPhone = {
  status?: string;
  code_verification_status?: string;
  name_status?: string;
  quality_rating?: string;
  platform_type?: string;
  messaging_limit_tier?: string;
  whatsapp_business_manager_messaging_limit?: number;
};
export type FinalizeResult = { ok: boolean; state: string; message?: string; retryAt?: string };
export type WaLiveStatus = {
  connected: boolean; state: string; status: string | null; quality: string | null;
  tier: string | null; platformType: string | null; message?: string; errorCode?: number; phoneNumberId?: string | null;
};

async function saveFailure(userId: string, error: unknown): Promise<FinalizeResult> {
  const mapped = mapOnboardingFailure(error);
  const current = mapped.state === "failed"
    ? await UserModel.findById(userId).select("waOnboarding.state").lean()
    : null;
  const retryState = current?.waOnboarding?.state;
  const state: FinalizeResult["state"] = mapped.state === "failed" && ["signup_complete", "registering", "subscribing"].includes(retryState ?? "")
    ? retryState as FinalizeResult["state"]
    : mapped.state;
  const lastError = { ...(mapped.code !== undefined ? { code: mapped.code } : {}), ...(mapped.subcode !== undefined ? { subcode: mapped.subcode } : {}), message: mapped.message, at: new Date() };
  await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.state": state, "waOnboarding.lastError": lastError, ...(mapped.retryAt ? { "waOnboarding.nextRetryAt": mapped.retryAt } : {}) }, $inc: { "waOnboarding.attempts": 1 } });
  if (error instanceof MetaGraphError) logger.error({ userId, code: error.code, subcode: error.subcode, fbtraceId: error.fbtraceId, status: error.status }, "WhatsApp onboarding Graph API failure");
  else logger.error({ userId, error: sanitizeMetaMessage(error instanceof Error ? error.message : mapped.message) }, "WhatsApp onboarding failed");
  return { ok: false, state: state ?? mapped.state, message: mapped.message, ...(mapped.retryAt ? { retryAt: mapped.retryAt.toISOString() } : {}) };
}

async function finalize(userId: string, request: GraphRequest): Promise<FinalizeResult> {
  try {
    if (!mongoose.isValidObjectId(userId)) return { ok: false, state: "action_required", message: "Invalid tenant account." };
    const user = await UserModel.findById(userId).select("_id metaWabaId metaPhoneNumberId waOnboarding isProtectedMasterAdmin").lean();
    if (!user || user.isProtectedMasterAdmin || !user.metaWabaId || !user.metaPhoneNumberId) return { ok: false, state: "action_required", message: "WhatsApp signup did not provide a business account and phone number." };
    const credential = await runWithTenant(userId, () => WhatsAppCredentialModel.findOne({ userId: new mongoose.Types.ObjectId(userId) }).select("wabaId phoneNumberId accessTokenEncrypted").lean());
    if (!credential || credential.wabaId !== user.metaWabaId || credential.phoneNumberId !== user.metaPhoneNumberId) throw new Error("Tenant WhatsApp credentials are missing or do not match signup.");
    const token = decryptToken(credential.accessTokenEncrypted);
    const phonePath = `${encodeURIComponent(credential.phoneNumberId)}?fields=${encodeURIComponent(FIELDS)}`;
    const phone = await request<MetaPhone>("GET", phonePath, token);
    const now = new Date();
    await UserModel.updateOne({ _id: userId }, { $set: { waStatus: phone.status ?? null, waQuality: phone.quality_rating ?? null, waTier: phone.messaging_limit_tier ?? null, waPlatformType: phone.platform_type ?? null, waNameStatus: phone.name_status ?? null, "waOnboarding.lastCheckedAt": now } });
    if (phone.code_verification_status !== "VERIFIED") {
      const message = "Number not verified. Complete phone-number verification in WhatsApp Manager before retrying.";
      await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.state": "action_required", "waOnboarding.lastError": { message, at: now } } });
      return { ok: false, state: "action_required", message };
    }
    const alreadyConnected = phone.status === "CONNECTED" && phone.platform_type === "CLOUD_API";
    let pinEncrypted = user.waOnboarding?.pinEncrypted;
    const registrationAlreadyAccepted = Boolean(user.waOnboarding?.registeredAt);
    if (!alreadyConnected && !registrationAlreadyAccepted) {
      if (!pinEncrypted) {
        if (!process.env.WA_PIN_ENCRYPTION_KEY) throw new Error("WA_PIN_ENCRYPTION_KEY is not configured; cannot safely save a registration PIN.");
        const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
        pinEncrypted = encryptOnboardingPin(pin);
        await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.pinEncrypted": pinEncrypted, "waOnboarding.state": "registering" } });
      }
      await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.state": "registering" } });
      await request("POST", `${encodeURIComponent(credential.phoneNumberId)}/register`, token, { messaging_product: "whatsapp", pin: decryptOnboardingPin(pinEncrypted) });
      await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.registeredAt": new Date(), "waOnboarding.state": "subscribing" } });
    } else {
      await UserModel.updateOne({ _id: userId }, { $set: { "waOnboarding.state": "subscribing" } });
    }
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("META_APP_ID is not configured.");
    const wabaPath = `${encodeURIComponent(credential.wabaId)}/subscribed_apps`;
    await request("POST", wabaPath, token, {});
    const subscription = await request<{ data?: Array<{ id?: string; whatsapp_business_api_data?: { id?: string } }> }>("GET", wabaPath, token);
    if (!subscription.data?.some((app) => (app.whatsapp_business_api_data?.id ?? app.id) === appId)) throw new Error("Meta did not confirm that this app is subscribed to the WhatsApp Business Account.");
    const verified = await request<MetaPhone>("GET", phonePath, token);
    const checkedAt = new Date();
    const updated = { status: verified.status ?? null, quality: verified.quality_rating ?? null, tier: verified.messaging_limit_tier ?? null, platform: verified.platform_type ?? null };
    const nowConnected = verified.status === "CONNECTED" && verified.platform_type === "CLOUD_API";
    await UserModel.updateOne({ _id: userId }, { $set: { waStatus: updated.status, waQuality: updated.quality, waTier: updated.tier, waPlatformType: updated.platform, waNameStatus: verified.name_status ?? null, "waOnboarding.state": nowConnected ? "connected" : "signup_complete", "waOnboarding.subscribedAt": checkedAt, "waOnboarding.lastCheckedAt": checkedAt, ...(alreadyConnected || registrationAlreadyAccepted || verified.status === "CONNECTED" ? { "waOnboarding.registeredAt": user.waOnboarding?.registeredAt ?? checkedAt } : {}), ...(nowConnected ? { "waOnboarding.attempts": 0 } : {}) }, ...(nowConnected ? { $unset: { "waOnboarding.lastError": 1, "waOnboarding.nextRetryAt": 1 } } : { $inc: { "waOnboarding.attempts": 1 } }) });
    statusCache.delete(userId);
    const pendingAttempts = Number(user.waOnboarding?.attempts ?? 0) + 1;
    if (!nowConnected && pendingAttempts < 5) scheduleRetry(userId, request);
    return { ok: nowConnected, state: nowConnected ? "connected" : "signup_complete", ...(!nowConnected ? { message: "Registration is processing; status will be checked again shortly." } : {}) };
  } catch (error) {
    return await saveFailure(userId, error);
  }
}

function scheduleRetry(userId: string, request: GraphRequest = graphRequest) {
  if (retryTimers.has(userId)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(userId);
    void finalizeOnboarding(userId, request);
  }, 60_000);
  timer.unref?.();
  retryTimers.set(userId, timer);
}

export function finalizeOnboarding(userId: string, request: GraphRequest = graphRequest): Promise<FinalizeResult> {
  const existing = locks.get(userId);
  if (existing) return existing;
  const work = finalize(userId, request)
    .catch((error) => {
      logger.error({ userId, message: error instanceof Error ? error.message : "Unexpected onboarding error" }, "WhatsApp onboarding handler failed safely");
      return { ok: false, state: "failed", message: "WhatsApp setup could not be completed. Please retry." } satisfies FinalizeResult;
    })
    .finally(() => locks.delete(userId));
  locks.set(userId, work);
  return work;
}

export async function getLiveWaStatus(userId: string, request: GraphRequest = graphRequest): Promise<WaLiveStatus> {
  const cached = statusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const user = await UserModel.findById(userId).select("waOnboarding waStatus waQuality waTier waPlatformType metaPhoneNumberId").lean();
  const fallback: WaLiveStatus = { connected: user?.waStatus === "CONNECTED" && user?.waPlatformType === "CLOUD_API", state: user?.waOnboarding?.state ?? "signup_complete", status: user?.waStatus ?? null, quality: user?.waQuality ?? null, tier: user?.waTier ?? null, platformType: user?.waPlatformType ?? null, message: user?.waOnboarding?.lastError?.message ?? undefined, errorCode: user?.waOnboarding?.lastError?.code ?? undefined, phoneNumberId: user?.metaPhoneNumberId ?? null };
  try {
    const credential = await runWithTenant(userId, () => WhatsAppCredentialModel.findOne({ userId: new mongoose.Types.ObjectId(userId) }).select("phoneNumberId accessTokenEncrypted").lean());
    if (!credential) return fallback;
    const token = decryptToken(credential.accessTokenEncrypted);
    const live = await request<MetaPhone>( "GET", `${encodeURIComponent(credential.phoneNumberId)}?fields=${encodeURIComponent(FIELDS)}`, token);
    const value: WaLiveStatus = { ...fallback, connected: live.status === "CONNECTED" && live.platform_type === "CLOUD_API", status: live.status ?? fallback.status, quality: live.quality_rating ?? fallback.quality, tier: live.messaging_limit_tier ?? fallback.tier, platformType: live.platform_type ?? fallback.platformType };
    statusCache.set(userId, { expiresAt: Date.now() + 60_000, value });
    return value;
  } catch {
    return fallback;
  }
}

export async function retryEligibleOnboarding(limit = 100) {
  const now = new Date();
  const users = await UserModel.find({
    metaWabaId: { $exists: true, $ne: null },
    metaPhoneNumberId: { $exists: true, $ne: null },
    isProtectedMasterAdmin: { $ne: true },
    $and: [
      { $or: [{ "waOnboarding.state": { $nin: ["connected", "action_required"] } }, { "waOnboarding.state": "action_required", "waOnboarding.lastError.code": 133016 }, { waOnboarding: { $exists: false } }] },
      { $or: [{ "waOnboarding.attempts": { $lt: 5 } }, { "waOnboarding.attempts": { $exists: false } }] },
      { $or: [{ "waOnboarding.nextRetryAt": { $exists: false } }, { "waOnboarding.nextRetryAt": null }, { "waOnboarding.nextRetryAt": { $lte: now } }] },
      { $or: [{ "waOnboarding.lastCheckedAt": { $exists: false } }, { "waOnboarding.lastCheckedAt": { $lte: new Date(now.getTime() - 10 * 60_000) } }] },
    ],
  }).select("_id").limit(limit).lean();
  for (const user of users) await finalizeOnboarding(String(user._id));
  return users.length;
}
