---
name: Master Admin delegated connections
description: Master Admin can connect a selected user's Meta/WhatsApp account through Embedded Signup.
---

Master Admin connection actions must target an explicit user and store the resulting encrypted credential under that user's account. Regular users must remain restricted to their own connection.

**Why:** The admin needs to manage onboarding for clients, but sharing or exposing Meta tokens would break tenant isolation and security.

**How to apply:** Use the master-only target-user connection route for admin actions, keep credentials encrypted, show only safe WABA/phone metadata, and support connect, reconnect, and disconnect per user.