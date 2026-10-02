import assert from "node:assert/strict";
import test from "node:test";
import { deriveConversationTabState } from "./conversationTabState";
import { buildConversationActivityMatch } from "./conversationActivityQuery";

const hour = 60 * 60 * 1000;
const now = Date.parse("2026-10-02T12:00:00.000Z");

test("an unanswered template stays Sent only during its first 24 hours", () => {
  assert.equal(deriveConversationTabState(null, now - 23 * hour, now), "SENT");
  assert.equal(deriveConversationTabState(null, now - 24 * hour, now), "CLOSED");
  assert.equal(deriveConversationTabState(null, now - 25 * hour, now), "CLOSED");
});

test("a customer reply opens the conversation for 24 hours from that reply", () => {
  assert.equal(
    deriveConversationTabState(now - 23 * hour, now - 50 * hour, now),
    "OPEN",
  );
  assert.equal(
    deriveConversationTabState(now - 24 * hour, now - 50 * hour, now),
    "CLOSED",
  );
});

test("a newer unanswered template starts a fresh Sent period", () => {
  assert.equal(
    deriveConversationTabState(now - 30 * hour, now - 2 * hour, now),
    "SENT",
  );
  assert.equal(
    deriveConversationTabState(now - 30 * hour, now - 24 * hour, now),
    "CLOSED",
  );
});

test("a closed conversation remains closed and a contact without activity is Other", () => {
  assert.equal(deriveConversationTabState(null, null, now, true), "CLOSED");
  assert.equal(deriveConversationTabState(null, null, now), "OTHER");
});

test("successful AutoGamma outbound records qualify as template activity", () => {
  const match = buildConversationActivityMatch("tenant");
  assert.deepEqual(match.$or[1], {
    direction: "OUTBOUND",
    status: { $in: ["SENT", "DELIVERED", "READ"] },
    $or: [
      { templateId: { $exists: true, $ne: null } },
      { externalMessageId: { $exists: true, $ne: null } },
    ],
  });
});