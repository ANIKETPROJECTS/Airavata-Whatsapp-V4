export function buildConversationActivityMatch(userId: unknown) {
  return {
    userId,
    $or: [
      { direction: "INBOUND" },
      {
        direction: "OUTBOUND",
        status: { $in: ["SENT", "DELIVERED", "READ"] },
        // AutoGamma sends are stored with externalMessageId instead of templateId.
        $or: [
          { templateId: { $exists: true, $ne: null } },
          { externalMessageId: { $exists: true, $ne: null } },
        ],
      },
    ],
  };
}