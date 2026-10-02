---
name: Native WhatsApp payments
description: Meta's India Payment Gateway flow with Razorpay, payment reconciliation, and refund retry safety.
---

For the India Payment Gateway flow, the order-details configuration name and the refund `payment_config_id` are separate identifiers. Persist the configuration values used by each order. Treat payment webhooks only as signals and confirm status using Meta's direct payment lookup before changing the captured state.

Meta's refund call is `POST /{PHONE_NUMBER_ID}/payments_refund`. It uses `reference_id`, `payment_config_id`, `speed`, and an INR amount whose `value` and `offset` are serialized as strings. Refund requests need a per-order atomic claim. Release it on an explicit rejection; if the outcome is ambiguous after a timeout or server error, keep the claim until a later Meta lookup confirms the refund or its failure.

**Why:** Webhooks are not authoritative, and blindly retrying a refund after a lost response can create duplicate refunds.

**How to apply:** Keep identifiers distinct, reconcile payment and refund state directly with Meta, and prefer blocking a retry over risking a second refund when the provider outcome is unknown.