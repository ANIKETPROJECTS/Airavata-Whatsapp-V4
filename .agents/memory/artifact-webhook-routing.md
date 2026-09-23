---
name: Artifact webhook routing
description: Public webhook callbacks in the Airavata artifact must reach the API service through the frontend proxy.
---

When an external provider calls a root path such as `/webhook` on an artifact's public domain, the request can land on the frontend SPA instead of the API service. Forward root webhook paths explicitly to the API, while retaining `/api/webhook` as the canonical API path.

**Why:** The frontend fallback can return HTTP 200 with HTML, which looks healthy to an external verifier but never reaches webhook processing, so inbound WhatsApp messages disappear without an application error.

**How to apply:** When adding or debugging provider callbacks, test both public `/webhook` and `/api/webhook` paths and confirm the API log records the POST before investigating tenant matching or Live Chat polling.