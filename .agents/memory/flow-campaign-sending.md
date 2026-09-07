---
name: Flow campaign sending
description: Architectural rule for WhatsApp Flow campaign sends and response attribution.
---

WhatsApp Flow campaign sends must enter the same queued campaign worker and executor as template sends. The executor must use strict tenant credentials, create CampaignSend tracking, and include both Flow and campaign context in the outbound flow token so inbound submissions can be attributed safely.

**Why:** A direct Meta request path bypasses recipient claims, failure tracking, tenant safeguards, and campaign reporting.

**How to apply:** Keep standalone Flow entry points as queueing adapters only; never call Meta directly from a route. Resolve the Flow and campaign under the authenticated user before sending, and persist campaignId on inbound Flow submission messages when the token validates it.