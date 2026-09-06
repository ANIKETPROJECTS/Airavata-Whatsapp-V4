---
name: Meta dashboard analytics
description: Dashboard sent and delivered totals come from Meta messaging analytics; read and failed remain webhook-derived.
---

For connected WhatsApp users, use Meta's WABA `analytics` field for authoritative sent, delivered, and received totals. Use `product_types(100)` for incoming messages. Meta's messaging analytics has a maximum one-year lookback and does not provide general read or failed message totals, so those cards must continue using persisted status webhooks.

**Why:** Local message records can include historical test sends or miss inbound webhook events; Meta is the source of truth for account-level message volume.

**How to apply:** Call Meta with the selected user's decrypted WABA credentials, label the Meta-backed metrics and one-year window in the UI, and never silently replace a connected account's Meta error with stale local sent/delivered totals.