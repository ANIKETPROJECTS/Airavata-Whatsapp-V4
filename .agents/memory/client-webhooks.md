---
name: Client webhook delivery
description: Tenant webhook registration, event delivery, and HMAC verification contract.
---

Client webhooks are tenant-scoped and currently deliver `contact_created` and `message_received`. Requests contain JSON with `id`, `event`, `createdAt`, and `data`.

**Why:** External receivers need a stable way to authenticate requests without exposing tenant credentials or coupling delivery to WhatsApp processing.

**How to apply:** Sign `${unixTimestamp}.${rawJsonBody}` with the webhook secret using HMAC-SHA256 and send `sha256=<hex>` in `X-Airavata-Webhook-Signature`, along with event ID, event name, and timestamp headers. Delivery is best-effort with bounded retries and must not block the originating tenant operation.