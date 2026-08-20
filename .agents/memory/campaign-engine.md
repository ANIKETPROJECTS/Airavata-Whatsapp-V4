---
name: Campaign execution architecture
description: Shared campaign delivery must claim per-recipient work before sending and resolve audience eligibility again at send time.
---

All campaign types should converge on the same executor and recipient/send records. Audience membership is only an enrollment snapshot; contact status and opt-out eligibility must be checked immediately before every outbound send. Idempotency is enforced by the campaign/contact/step key before calling Meta.

**Why:** Campaigns can be scheduled, retried, or triggered more than once, and contacts may unsubscribe after enrollment. Separate route-level send loops would make duplicate sends and policy violations likely.

**How to apply:** Add new campaign types by supplying scheduling or enrollment behavior around the existing executor; do not call the WhatsApp API directly from campaign routes.