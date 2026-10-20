---
name: Meta Tech Provider onboarding
description: Durable Meta onboarding context for AtWassup client accounts.
---

AtWassup operates as an approved Meta Tech Provider and uses the Meta app `Airavata_Solution` for client WhatsApp Embedded Signup.

**Why:** The user provided this as the context for automating phone registration after Embedded Signup; client WABAs must also subscribe to this app's webhooks.

**How to apply:** Keep client phone registration and WABA webhook subscription in the tenant-scoped Embedded Signup completion flow. Do not substitute a shared tenant token.
