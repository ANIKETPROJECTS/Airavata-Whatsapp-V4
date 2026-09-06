---
name: Meta messaging limit field
description: The current WhatsApp Manager limit comes from Meta's Business Manager field, not the deprecated phone tier field.
---

Use Meta's `whatsapp_business_manager_messaging_limit` field for the current business-initiated conversation limit. The older `messaging_limit_tier` field can remain stale even when WhatsApp Manager has already raised the account to a newer limit such as 2,000.

**Why:** Meta deprecated the old field and the protected operator's live response showed `TIER_250` there while the current Business Manager field returned `TIER_2K`.

**How to apply:** Request the current field from the phone-number endpoint, prefer it over the deprecated field, and format `TIER_2K` as 2,000 conversations in user-facing views.