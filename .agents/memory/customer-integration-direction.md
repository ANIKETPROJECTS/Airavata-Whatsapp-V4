---
name: Customer integration direction
description: Product direction for connecting Airavata to customer CRMs, ERPs, websites, and automation tools.
---

Airavata's customer integrations should work for any HTTP-capable CRM, ERP, website, or automation tool through a tenant-scoped API and signed webhooks. Provider-specific cards must not claim one-click/native support unless a real authorization and data-sync flow exists.

External CRM inbox reads must use the same tenant API-key authentication and phone-number mapping as sends, and read Airavata's persisted tenant messages rather than implying WhatsApp/Meta provides historical transcript retrieval.

Airavata should be presented as cross-industry, not ecommerce-only; examples include retail, restaurants, clinics, schools, and services.

**Why:** The user asked for an approach that is easy for customers and broadly compatible, and said the product serves businesses beyond ecommerce. HTTP APIs and signed callbacks provide broad system reach without implying separate OAuth connectors already exist.

**How to apply:** Use business examples as inclusive, not exhaustive. Prefer expanding shared API/webhook contracts and clear setup guides before building native vendor integrations; keep credentials tenant-bound and server-side. For inbox reads, require a valid tenant API key plus its mapped WhatsApp phone-number ID and return only messages already persisted for that tenant.