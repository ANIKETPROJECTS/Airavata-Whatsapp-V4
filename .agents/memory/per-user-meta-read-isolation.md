---
name: Per-user Meta read isolation
description: Security rule for Meta API routes that display or manage one account's WhatsApp data.
---

Any authenticated route that displays a specific user's WhatsApp connection or Meta business data must resolve credentials from that user's stored credential record and must disable the shared environment fallback. A missing or unreadable credential should produce an explicit not-connected/error response, never another account's data.

**Why:** A route that only authenticates the session but reads shared META_WABA_ID/META_ACCESS_TOKEN can show one tenant's real WhatsApp data to every logged-in tenant.

**How to apply:** Use the authenticated user ID with the centralized credential helper in strict no-fallback mode. Audit direct META_ACCESS_TOKEN and META_WABA_ID reads whenever adding a Meta-backed route.