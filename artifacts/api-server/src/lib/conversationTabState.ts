export type ConversationTabState = "SENT" | "OPEN" | "CLOSED" | "OTHER";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function deriveConversationTabState(
  lastInboundAt: number | null,
  lastTemplateSentAt: number | null,
  now: number,
  manuallyClosed = false,
): ConversationTabState {
  const hasInbound = lastInboundAt !== null && Number.isFinite(lastInboundAt);
  const hasTemplateSent =
    lastTemplateSentAt !== null && Number.isFinite(lastTemplateSentAt);

  if (hasInbound && (!hasTemplateSent || lastInboundAt >= lastTemplateSentAt)) {
    return now - lastInboundAt < TWENTY_FOUR_HOURS_MS ? "OPEN" : "CLOSED";
  }

  if (hasTemplateSent) {
    return now - lastTemplateSentAt < TWENTY_FOUR_HOURS_MS ? "SENT" : "CLOSED";
  }

  if (hasInbound) {
    return now - lastInboundAt < TWENTY_FOUR_HOURS_MS ? "OPEN" : "CLOSED";
  }

  return manuallyClosed ? "CLOSED" : "OTHER";
}