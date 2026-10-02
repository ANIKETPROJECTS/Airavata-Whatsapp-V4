import assert from "node:assert/strict";
import test from "node:test";
import {
  persistExternalOutboundMessage,
  type ExternalOutboundMessageInput,
  type ExternalOutboundMessageStore,
  type NewOutboundMessage,
  type StoredOutboundMessage,
} from "./externalOutboundMessagePersistence";
import {
  authenticateAutoGammaRequest,
  extractAiravataApiKey,
  findMatchingApiKey,
  type AutoGammaAuthenticationDependencies,
  type ApiKeyCandidate,
} from "./apiKeyAuth";

class MockMessageStore implements ExternalOutboundMessageStore {
  contacts = new Map<string, { id: string }>();
  messages = new Map<string, StoredOutboundMessage>();
  insertedMessages: NewOutboundMessage[] = [];
  contactCount = 0;
  messageCount = 0;

  async findMessageByWhatsAppId(id: string): Promise<StoredOutboundMessage | null> {
    return this.messages.get(id) ?? null;
  }

  async findContactByPhone(phone: string): Promise<{ id: string } | null> {
    return this.contacts.get(phone) ?? null;
  }

  async createContact(phone: string): Promise<{ contact: { id: string }; created: boolean }> {
    if (this.contacts.has(phone)) {
      throw Object.assign(new Error("duplicate contact"), { code: 11000 });
    }
    const contact = { id: `contact-${++this.contactCount}` };
    this.contacts.set(phone, contact);
    return { contact, created: true };
  }

  async createOutboundMessage(input: NewOutboundMessage): Promise<StoredOutboundMessage> {
    if (this.messages.has(input.whatsappMessageId)) {
      throw Object.assign(new Error("duplicate message"), { code: 11000 });
    }
    const message = {
      id: `message-${++this.messageCount}`,
      contactId: input.contactId,
      status: input.status,
    };
    this.messages.set(input.whatsappMessageId, message);
    this.insertedMessages.push(input);
    return message;
  }
}

const payload: ExternalOutboundMessageInput = {
  whatsappMessageId: "wamid.autogamma-test-001",
  recipientPhone: "919876543210",
  body: "Your PPF inspection is complete.",
  sentAt: new Date("2026-09-30T12:00:00.000Z"),
};

test("records an outbound message without sending it", async () => {
  const store = new MockMessageStore();
  const result = await persistExternalOutboundMessage(payload, store);

  assert.equal(result.created, true);
  assert.equal(result.contactCreated, true);
  assert.equal(store.messageCount, 1);
  assert.equal(store.insertedMessages[0]?.direction, "OUTBOUND");
  assert.equal(store.insertedMessages[0]?.status, "SENT");
  assert.equal(store.insertedMessages[0]?.body, payload.body);
  assert.equal(store.insertedMessages[0]?.whatsappMessageId, payload.whatsappMessageId);
  assert.equal(store.insertedMessages[0]?.externalMessageId, payload.whatsappMessageId);
  assert.equal(store.insertedMessages[0]?.contactId, result.message.contactId);
});

test("reuses an existing contact and duplicate Meta IDs do not add another message", async () => {
  const store = new MockMessageStore();
  store.contacts.set("+919876543210", { id: "contact-existing" });

  const first = await persistExternalOutboundMessage(payload, store);
  const retry = await persistExternalOutboundMessage(payload, store);

  assert.equal(first.message.contactId, "contact-existing");
  assert.equal(first.contactCreated, false);
  assert.equal(retry.created, false);
  assert.equal(retry.message.id, first.message.id);
  assert.equal(store.contactCount, 0);
  assert.equal(store.messageCount, 1);
});

test("concurrent retries produce one contact and one chat message", async () => {
  const store = new MockMessageStore();
  const results = await Promise.all([
    persistExternalOutboundMessage(payload, store),
    persistExternalOutboundMessage(payload, store),
  ]);

  assert.equal(store.contactCount, 1);
  assert.equal(store.messageCount, 1);
  assert.equal(new Set(results.map((result) => result.message.id)).size, 1);
  assert.equal(results.filter((result) => result.created).length, 1);
});

test("accepts only Airavata API keys in the Authorization bearer header", () => {
  const key = `aira_${"a".repeat(40)}`;
  assert.equal(extractAiravataApiKey(`Bearer ${key}`), key);
  assert.equal(extractAiravataApiKey("Bearer not-an-api-key"), null);
  assert.equal(extractAiravataApiKey(undefined), null);
});

test("matches the bearer key only against active tenant key candidates", async () => {
  const key = `aira_${"b".repeat(40)}`;
  const candidates: ApiKeyCandidate[] = [
    { _id: "wrong", keyHash: "different" },
    { _id: "right", keyHash: key },
  ];

  const match = await findMatchingApiKey(key, candidates, async (raw, hash) => raw === hash);
  assert.equal(match?._id, "right");
  assert.equal(
    await findMatchingApiKey(key, candidates.slice(0, 1), async (raw, hash) => raw === hash),
    null,
  );
});

function mockAuthenticationDependencies(options?: {
  ownerExists?: boolean;
  keyMatches?: boolean;
  credentialPhoneNumberId?: string;
}) {
  const calls = {
    tenantId: "",
    markedKeyUsed: false,
    credentialsChecked: false,
  };
  const key = `aira_${"c".repeat(40)}`;
  const dependencies: AutoGammaAuthenticationDependencies = {
    findOwnerByPhoneNumberId: async () =>
      options?.ownerExists === false ? null : { id: "tenant-user-id" },
    runWithTenant: async <T>(userId: string, callback: () => Promise<T>): Promise<T> => {
      calls.tenantId = userId;
      return callback();
    },
    findActiveApiKeyCandidates: async (): Promise<ApiKeyCandidate[]> =>
      options?.keyMatches === false
        ? []
        : [{ _id: "api-key-id", keyHash: key }],
    compareApiKey: async (rawKey, hash) => rawKey === hash,
    markApiKeyUsed: async () => {
      calls.markedKeyUsed = true;
    },
    getCredentialPhoneNumberId: async () => {
      calls.credentialsChecked = true;
      return options?.credentialPhoneNumberId ?? "1234567890";
    },
  };
  return { key, calls, dependencies };
}

test("authenticates with a tenant API key and confirms the stored phone mapping", async () => {
  const { key, calls, dependencies } = mockAuthenticationDependencies();
  const result = await authenticateAutoGammaRequest(
    "1234567890",
    `Bearer ${key}`,
    dependencies,
  );

  assert.deepEqual(result, { kind: "authorized", userId: "tenant-user-id" });
  assert.equal(calls.tenantId, "tenant-user-id");
  assert.equal(calls.credentialsChecked, true);
  assert.equal(calls.markedKeyUsed, true);
});

test("rejects a phone number with no tenant owner before reading tenant data", async () => {
  const { key, calls, dependencies } = mockAuthenticationDependencies({ ownerExists: false });
  const result = await authenticateAutoGammaRequest(
    "9999999999",
    `Bearer ${key}`,
    dependencies,
  );

  assert.deepEqual(result, { kind: "unauthorized" });
  assert.equal(calls.tenantId, "");
  assert.equal(calls.credentialsChecked, false);
  assert.equal(calls.markedKeyUsed, false);
});

test("rejects an API key that is not active in the phone number's tenant", async () => {
  const { key, calls, dependencies } = mockAuthenticationDependencies({ keyMatches: false });
  const result = await authenticateAutoGammaRequest(
    "1234567890",
    `Bearer ${key}`,
    dependencies,
  );

  assert.deepEqual(result, { kind: "unauthorized" });
  assert.equal(calls.credentialsChecked, false);
  assert.equal(calls.markedKeyUsed, false);
});

test("rejects a mismatch between the control-plane and stored WhatsApp phone IDs", async () => {
  const { key, calls, dependencies } = mockAuthenticationDependencies({
    credentialPhoneNumberId: "different-phone-id",
  });
  const result = await authenticateAutoGammaRequest(
    "1234567890",
    `Bearer ${key}`,
    dependencies,
  );

  assert.deepEqual(result, { kind: "mapping_conflict" });
  assert.equal(calls.credentialsChecked, true);
  assert.equal(calls.markedKeyUsed, false);
});