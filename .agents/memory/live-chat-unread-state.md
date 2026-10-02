---
name: Live Chat unread state
description: Live Chat unread badges and Sent/Open/Closed lifecycle rules.
---

Live Chat treats a conversation as unread when it has inbound messages newer than the contact's `lastReadAt`; opening the conversation advances that timestamp, while new inbound activity reopens resolved conversations.

The Live Chat tabs mean: **Sent** is a successful template send awaiting a reply for less than 24 hours; **Open** is a customer reply with less than 24 hours elapsed; **Closed** is reached when 24 hours have elapsed since the latest relevant template send or inbound reply. An unanswered template must expire from Sent into Closed.

**Why:** Counting all inbound messages permanently inflated unread badges, and an unbounded unanswered-template state kept old chats in Sent indefinitely. These tab meanings were explicitly defined by the user.

AutoGamma's accepted outbound records use `externalMessageId` rather than Airavata's local `templateId`; count those records as template activity in the Live Chat lifecycle.

**Why:** Without that marker, a recent AutoGamma template send is omitted from the Sent timer and can leave the conversation Closed immediately.

**How to apply:** Derive tab state from each tenant's latest inbound and successful template timestamps, using outbound `sentAt` when available. Refresh the list periodically so a conversation changes tabs when its 24-hour period expires; keep unread markers tied to the authenticated user's contact and `lastReadAt`.