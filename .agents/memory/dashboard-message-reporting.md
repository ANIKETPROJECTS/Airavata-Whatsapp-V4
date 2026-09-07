---
name: Dashboard message reporting
description: Dashboard delivery health includes all unique outbound WhatsApp messages, while campaign reports remain campaign-only.
---

The dashboard's delivery overview should count unique outbound WhatsApp messages across templates, Live Chat, Flows, chatbots, and campaigns. Campaign reporting should continue to scope totals to campaign messages.

**Why:** Workspace users expect messages visible in Live Chat and direct template sends to appear in delivery health; campaign-only aggregation makes a connected workspace incorrectly show zero.

**How to apply:** Keep dashboard metrics on the all-message summary, but have campaign reports aggregate live `CampaignSend` statuses scoped by tenant user ID. Meta delivery/read/failed webhooks must update the matching `CampaignSend` row idempotently; cached `Campaign.stats` values are only compatibility counters.