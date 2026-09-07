---
name: Trigger enrollment idempotency
description: Safety rule for repeated trigger events enrolling campaign recipients.
---

Trigger enrollment must use an upsert keyed by `userId`, `campaignId`, and `contactId`, with `$setOnInsert` for the queued recipient fields. Existing recipients should produce a successful no-op response rather than a duplicate-key failure. Automatic enrollment for the canonical `contact_created` event should go through one shared service called by every contact creation path.

The Trigger Campaign UI should expose only the `contact_created` / “New contact added” event until other event handlers are implemented.

**Why:** Webhook and event delivery is retryable, so the same event can arrive more than once or race with another enrollment attempt.

**How to apply:** Keep the active-contact query tenant-scoped, report newly enrolled and already-enrolled counts, treat a unique-index race as a successful idempotent result after rechecking the recipient rows, and keep contact creation successful if the best-effort trigger lookup fails.