import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptOnboardingPin,
  encryptOnboardingPin,
  mapOnboardingFailure,
  MetaGraphError,
} from "./whatsappOnboarding";
import { graphRequest } from "./whatsappOnboardingPrimitives";
import { verifyMetaWebhookSignature } from "./metaWebhookSignature";
import { createHmac } from "node:crypto";
import { finalizeOnboarding, retryEligibleOnboarding } from "./whatsappOnboarding";

const originalFetch = globalThis.fetch;
const originalKey = process.env.WA_PIN_ENCRYPTION_KEY;
const testState = (globalThis as typeof globalThis & {
  __waOnboardingTestState?: { user: any; credential: any };
}).__waOnboardingTestState ??= { user: null, credential: null };

function prepareTenant() {
  testState.user = {
    _id: "0123456789abcdef01234567",
    metaWabaId: "waba-1",
    metaPhoneNumberId: "phone-1",
    waOnboarding: { state: "signup_complete", attempts: 0 },
  };
  testState.credential = {
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    accessTokenEncrypted: "encrypted-token",
  };
  process.env.META_APP_ID = "app-1";
  process.env.WA_PIN_ENCRYPTION_KEY = "a".repeat(64);
}

function graphResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function phone(status: string, platform_type = "CLOUD_API") {
  return { status, platform_type, code_verification_status: "VERIFIED", quality_rating: "GREEN", messaging_limit_tier: "TIER_1" };
}

test("full onboarding registers, subscribes, confirms the app, then becomes connected", async () => {
  prepareTenant();
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body?.toString() });
    if (url.includes("/phone-1/register")) return graphResponse({ success: true });
    if (url.includes("/waba-1/subscribed_apps") && method === "POST") return graphResponse({ success: true });
    if (url.includes("/waba-1/subscribed_apps")) return graphResponse({ data: [{ whatsapp_business_api_data: { id: "app-1" } }] });
    return graphResponse(phone(calls.filter((call) => call.url.includes("/phone-1?")).length === 1 ? "PENDING" : "CONNECTED"));
  }) as typeof fetch;
  try {
    const result = await finalizeOnboarding(testState.user._id);
    assert.deepEqual(result, { ok: true, state: "connected" });
    assert.deepEqual(calls.map(({ method, url }) => `${method} ${new URL(url).pathname.split("/").pop()}`), [
      "GET phone-1", "POST register", "POST subscribed_apps", "GET subscribed_apps", "GET phone-1",
    ]);
    assert.equal(testState.user.waStatus, "CONNECTED");
    assert.equal(testState.user.waOnboarding.state, "connected");
    assert.ok(testState.user.waOnboarding.subscribedAt);
    assert.ok(testState.user.waOnboarding.registeredAt);
    assert.ok(testState.user.waOnboarding.pinEncrypted);
    assert.equal(JSON.stringify(result).includes(decryptOnboardingPin(testState.user.waOnboarding.pinEncrypted)), false);
    assert.equal(calls.some((call) => call.url.includes("mock-access-token")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("already-connected phone without saved PIN is not registered but is subscribed", async () => {
  prepareTenant();
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/subscribed_apps") && init?.method === "GET") return graphResponse({ data: [{ whatsapp_business_api_data: { id: "app-1" } }] });
    return graphResponse(phone("CONNECTED"));
  }) as typeof fetch;
  try {
    const result = await finalizeOnboarding(testState.user._id);
    assert.equal(result.state, "connected");
    assert.equal(calls.some((call) => call.includes("/register")), false);
    assert.equal(calls.some((call) => call.includes("/subscribed_apps")), true);
    assert.equal(testState.user.waOnboarding.pinEncrypted, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test("wrong PIN maps to action required and does not auto-retry", async () => {
  prepareTenant();
  let registerCalls = 0;
  globalThis.fetch = (async (input) => {
    if (String(input).includes("/register")) {
      registerCalls += 1;
      return graphResponse({ error: { message: "bad pin", code: 133005 } }, 400);
    }
    return graphResponse(phone("PENDING"));
  }) as typeof fetch;
  try {
    const result = await finalizeOnboarding(testState.user._id);
    assert.equal(result.state, "action_required");
    assert.match(result.message ?? "", /Two-step PIN mismatch/);
    assert.equal(registerCalls, 1);
    assert.equal(testState.user.waOnboarding.lastError.code, 133005);
    assert.equal(JSON.stringify(result).includes(decryptOnboardingPin(testState.user.waOnboarding.pinEncrypted)), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("too-many-attempts error waits 72 hours and token errors request reconnect", async () => {
  prepareTenant();
  globalThis.fetch = async () => graphResponse({ error: { message: "cooldown", code: 133016 } }, 400);
  const start = Date.now();
  try {
    const result = await finalizeOnboarding(testState.user._id);
    assert.equal(result.state, "action_required");
    assert.ok(Math.abs(new Date(result.retryAt!).getTime() - start - 72 * 60 * 60 * 1000) < 1500);
    prepareTenant();
    globalThis.fetch = async () => graphResponse({ error: { message: "expired", code: 190 } }, 400);
    const expired = await finalizeOnboarding(testState.user._id);
    assert.match(expired.message ?? "", /Reconnect Facebook/);
  } finally { globalThis.fetch = originalFetch; }
});

test("parallel finalization calls share one Graph sequence", async () => {
  prepareTenant();
  let calls = 0;
  let phoneReads = 0;
  globalThis.fetch = (async (input, init) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const url = String(input);
    if (url.includes("/register") || (url.includes("/subscribed_apps") && init?.method === "POST")) return graphResponse({ success: true });
    if (url.includes("/subscribed_apps")) return graphResponse({ data: [{ whatsapp_business_api_data: { id: "app-1" } }] });
    phoneReads += 1;
    return graphResponse(phone(phoneReads === 1 ? "PENDING" : "CONNECTED"));
  }) as typeof fetch;
  try {
    const [first, second] = await Promise.all([
      finalizeOnboarding(testState.user._id),
      finalizeOnboarding(testState.user._id),
    ]);
    assert.deepEqual(first, second);
    assert.equal(calls, 5);
  } finally { globalThis.fetch = originalFetch; }
});

test("sweep includes tenants without an onboarding document", async () => {
  prepareTenant();
  delete testState.user.waOnboarding;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/register") || (url.includes("/subscribed_apps") && init?.method === "POST")) return graphResponse({ success: true });
    if (url.includes("/subscribed_apps")) return graphResponse({ data: [{ whatsapp_business_api_data: { id: "app-1" } }] });
    return graphResponse(phone("CONNECTED"));
  };
  try {
    assert.equal(await retryEligibleOnboarding(), 1);
    assert.equal(testState.user.waOnboarding.state, "connected");
  } finally { globalThis.fetch = originalFetch; }
});

test("onboarding PIN is encrypted at rest and round-trips", () => {
  process.env.WA_PIN_ENCRYPTION_KEY = "a".repeat(64);
  const pin = "037291";
  const encrypted = encryptOnboardingPin(pin);
  assert.notEqual(encrypted, pin);
  assert.equal(encrypted.includes(pin), false);
  assert.equal(decryptOnboardingPin(encrypted), pin);
});

test("onboarding PIN encryption fails safely without its key", () => {
  delete process.env.WA_PIN_ENCRYPTION_KEY;
  assert.throws(() => encryptOnboardingPin("037291"), /WA_PIN_ENCRYPTION_KEY/);
});

test("Graph helper keeps token out of URL and retries server errors", async () => {
  let calls = 0;
  let capturedUrl = "";
  let capturedAuthorization = "";
  globalThis.fetch = (async (input, init) => {
    calls += 1;
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    if (calls < 3) return new Response(JSON.stringify({ error: { message: "temporary" } }), { status: 503 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await graphRequest<{ success: boolean }>("POST", "123/register", "secret-token", { pin: "037291" });
    assert.deepEqual(result, { success: true });
    assert.equal(calls, 3);
    assert.equal(capturedUrl.includes("secret-token"), false);
    assert.equal(capturedAuthorization, "Bearer secret-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Graph helper does not retry a 4xx response and preserves Meta error fields", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: { message: "invalid pin", code: 133005, error_subcode: 34, fbtrace_id: "trace-1" },
    }), { status: 400 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      graphRequest("POST", "123/register", "secret-token", { pin: "037291" }),
      (error: unknown) => {
        assert.ok(error instanceof MetaGraphError);
        assert.equal(error.code, 133005);
        assert.equal(error.subcode, 34);
        assert.equal(error.fbtraceId, "trace-1");
        assert.equal(error.status, 400);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration failures map to safe user-facing actions", () => {
  const wrongPin = mapOnboardingFailure(new MetaGraphError("bad pin 123456", 133005, undefined, "trace", 400));
  assert.equal(wrongPin.state, "action_required");
  assert.match(wrongPin.message, /Two-step PIN mismatch/);
  assert.equal(JSON.stringify(wrongPin).includes("123456"), false);

  const rateLimited = mapOnboardingFailure(new MetaGraphError("too many attempts", 133016, undefined, undefined, 400));
  assert.equal(rateLimited.state, "action_required");
  assert.ok(rateLimited.retryAt);
  assert.ok(Math.abs(rateLimited.retryAt!.getTime() - Date.now() - 72 * 60 * 60 * 1000) < 1000);

  const expired = mapOnboardingFailure(new MetaGraphError("token expired", 190, undefined, undefined, 400));
  assert.equal(expired.state, "action_required");
  assert.match(expired.message, /Reconnect Facebook/);
});

test("webhook signature validation accepts only the exact signed body", () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = `sha256=${createHmac("sha256", "test-secret").update(raw).digest("hex")}`;
  assert.equal(verifyMetaWebhookSignature(raw, signature, "test-secret"), true);
  assert.equal(verifyMetaWebhookSignature(Buffer.from("{}"), signature, "test-secret"), false);
  assert.equal(verifyMetaWebhookSignature(raw, undefined, "test-secret"), false);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.WA_PIN_ENCRYPTION_KEY;
  else process.env.WA_PIN_ENCRYPTION_KEY = originalKey;
});
