---
name: Native WhatsApp payments
description: Meta's India Payment Gateway flow with Razorpay, payment reconciliation, and refund retry safety.
---

For India native payments, start Razorpay linking inside Airavata with Meta's payment-configuration APIs, reuse a tenant's existing Razorpay configuration when available, and require a live `Active` status before sending an order. The merchant still has to approve the provider authorization screen. The configuration name used in order details is also the refund API's `payment_config_id`; persist that exact value with each order rather than asking for a second ID.

Meta can reject a repeated configuration name even when a preceding list call did not surface that entry. On a duplicate-name response, fetch that exact configuration and resume it if it belongs to Razorpay before trying a new unique name.

Meta's refund call is `POST /{PHONE_NUMBER_ID}/payments_refund`. It uses `reference_id`, `payment_config_id`, `speed`, and an INR amount whose `value` and `offset` are serialized as strings. Refund requests need a per-order atomic claim. Release it on an explicit rejection; if the outcome is ambiguous after a timeout or server error, keep the claim until a later Meta lookup confirms the refund or its failure.

Treat payment webhooks only as signals and confirm status using Meta's direct payment lookup before changing the captured state.

**Why:** The product owner wants merchants to avoid manual Meta dashboard setup; Meta's authorization step still requires merchant approval. Meta's order/refund contract identifies the same payment configuration by its configuration name. Duplicate-name conflicts may race with list visibility. Webhooks are not authoritative, and blindly retrying a refund after a lost response can create duplicate refunds.

**How to apply:** Resolve Meta credentials strictly for the authenticated tenant, start or resume the authorization link in Airavata, and re-check Meta's live configuration status after return. On create conflicts, read the exact configuration before retrying with a unique name. Keep the order configuration name with each order, reconcile payment and refund state directly with Meta, and prefer blocking a refund retry over risking a duplicate when the provider outcome is unknown.