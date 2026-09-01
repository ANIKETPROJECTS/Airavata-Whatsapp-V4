---
name: Per-user Meta read isolation
description: Security rule for all tenant-scoped Meta API operations.
---

Every tenant-scoped WhatsApp/Meta operation—including template CRUD, status sync, media upload, and outbound sends—must resolve credentials from the target user's stored credential record and disable the shared environment fallback. A missing or unreadable credential should produce an explicit not-connected/error response, never another account's data. Shared environment credentials are only acceptable for explicitly non-tenant tooling.

**Why:** Authenticating the session is not enough if a helper silently reads shared META_WABA_ID/META_ACCESS_TOKEN; it can send or show one tenant's WhatsApp data under another account and bill the wrong WABA.

**How to apply:** Require a user ID in Meta helper APIs, use the centralized credential helper in strict no-fallback mode, and audit direct META_ACCESS_TOKEN/META_WABA_ID reads whenever adding a Meta-backed route.