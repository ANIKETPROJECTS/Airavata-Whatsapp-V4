---
name: Live Chat unread state
description: Conversation badges are derived from inbound messages after each contact's lastReadAt timestamp.
---

Live Chat treats a conversation as unread when it has inbound messages newer than the contact's `lastReadAt`; opening the conversation advances that timestamp, while new inbound activity reopens resolved conversations.

**Why:** Counting all inbound messages permanently inflated badges and made Open/Resolved filters meaningless.

**How to apply:** Keep status transitions and read-marker updates scoped to the authenticated user's contact, and invalidate the conversation list after either mutation.