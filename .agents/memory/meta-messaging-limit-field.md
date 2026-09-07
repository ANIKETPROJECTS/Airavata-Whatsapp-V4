---
name: Meta messaging limit field
description: The current WhatsApp Manager limit comes from Meta's Business Manager field, not the deprecated phone tier field.
---

Use Meta's `whatsapp_business_manager_messaging_limit` field for the current business-initiated conversation limit. The older `messaging_limit_tier` field can remain stale even when WhatsApp Manager has already raised the account to a newer limit such as 2,000. Cache the tier and parsed numeric limit on the control-plane user record, and defer new-conversation campaign recipients at a 90% safety threshold until the tenant's next local day.

**Why:** Meta deprecated the old field and the protected operator's live response showed `TIER_250` there while the current Business Manager field returned `TIER_2K`.

**How to apply:** Request the current field from the phone-number endpoint, prefer it over the deprecated field, parse values such as `TIER_2K` as 2,000 conversations, count unique outbound contacts for the tenant's local day, allow contacts already messaged that day, and requeue new contacts for the next day when the safety threshold is reached.