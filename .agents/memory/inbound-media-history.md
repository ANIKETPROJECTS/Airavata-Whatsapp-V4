---
name: Inbound media history
description: Requirements for showing customer-sent WhatsApp attachments in tenant Live Chat.
---

Persist inbound WhatsApp image, video, document, and audio message metadata—especially Meta's media ID and media type—in the receiving tenant's Message record. Preserve document filenames and media captions when present. Live Chat should fetch the file through the authenticated media proxy using that tenant's credentials; do not store raw file bytes in MongoDB unless durable file archiving is explicitly requested.

**Why:** Placeholder-only inbound records are not enough; the creator requires customer-sent attachments to remain visible in the correct tenant's Live Chat history.

**How to apply:** Resolve the tenant from the receiving phone number, save media metadata in that tenant context, return it with conversation history, and render from the Meta media ID without shared-credential fallback.
