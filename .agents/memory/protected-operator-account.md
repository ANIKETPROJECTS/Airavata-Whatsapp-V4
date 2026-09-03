---
name: Protected operator account
description: The designated operator account is protected from deletion and uses deployment-level WhatsApp credentials instead of Embedded Signup.
---

The designated protected operator account must remain editable but cannot be deleted, disconnected, or routed through Facebook Embedded Signup. Its authenticated connection status should be reported as connected, and WhatsApp operations should use the deployment-level credentials directly.

**Why:** This restores the original operator workflow while preventing shared ecosystem credentials from becoming a fallback for ordinary tenant accounts.

**How to apply:** Keep account matching and protection checks server-side, expose only a non-secret protected/status flag to the UI, and preserve strict tenant credential isolation for every other account.

For inbound and delivery webhooks, resolve the protected tenant by matching the configured ecosystem `META_PHONE_NUMBER_ID` when no user-level Embedded Signup phone ID exists.

**Why:** The protected account can send with deployment credentials without a Facebook connection record, but Meta still sends events keyed only by the receiving phone number ID; user-level lookup alone silently drops those events.

**How to apply:** Resolve ordinary users by their stored Meta phone ID first, then allow the ecosystem phone ID to resolve only the server-designated protected operator.

The ecosystem WABA must also be subscribed to the app's WhatsApp webhook events; this subscription can be safely rechecked idempotently when the API starts.

**Why:** A correct callback route and tenant resolver still receive nothing if Meta has not subscribed the WABA to the app.

**How to apply:** Keep `/api/webhook` as the canonical callback, support `/webhook` for existing configurations, and verify the WABA subscription with deployment credentials without logging secrets.