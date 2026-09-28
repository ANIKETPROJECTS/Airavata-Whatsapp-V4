---
name: Artifact webhook routing
description: Airavata WhatsApp callbacks must use the public server domain and reach the API service through the correct route.
---

For the deployed Airavata server, configure Meta against the public server domain using `/api/webhook`, not a Replit development URL. When an external provider calls a root path such as `/webhook` on an artifact's public domain, the request can land on the frontend SPA instead of the API service. Forward root webhook paths explicitly to the API, while retaining `/api/webhook` as the canonical API path.

Moving an encrypted WhatsApp credential into a tenant database does not recreate its per-WABA Meta webhook subscription. Legacy restore and authenticated repair paths must explicitly re-subscribe the tenant WABA; a startup sweep alone can miss credentials restored after the server starts. Repair must use only the authenticated tenant's readable credential and never fall back to shared credentials.

**Why:** The frontend fallback can return HTTP 200 with HTML, which looks healthy to an external verifier but never reaches webhook processing, so inbound WhatsApp messages disappear without an application error. The confirmed live setup uses the public custom domain, Meta verification succeeds there, and subscribing to the `messages` field restores inbound Live Chat replies.

**How to apply:** When adding or debugging provider callbacks, use the public server domain plus `/api/webhook`, verify the token in Meta, subscribe to `messages`, and confirm the external server log records the POST before investigating tenant matching or Live Chat polling. Re-subscribe after credential recovery and use strict tenant-scoped credentials. Test both public `/webhook` and `/api/webhook` paths only when routing compatibility is needed.