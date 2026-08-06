---
name: Meta webhook secret name
description: The webhook verifier supports the configured Replit token name and a legacy fallback.
---

The Meta webhook verification token is stored as `WEBHOOK_VERIFY_TOKEN` in this workspace; the server also accepts the older `WHATSAPP_VERIFY_TOKEN` name for compatibility.

**Why:** Meta verification returned HTTP 500 when the app read only a different secret name, preventing Flow completion events from reaching the chatbot.

**How to apply:** When configuring Meta, use the public API URL ending in `/api/webhook` and enter the value of the configured webhook verification secret; the server should return the challenge with HTTP 200.