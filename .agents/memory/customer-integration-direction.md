---
name: Customer integration direction
description: Product direction for connecting Airavata to customer CRMs, ERPs, websites, and automation tools.
---

Airavata's customer integrations should work for any HTTP-capable CRM, ERP, website, or automation tool through a tenant-scoped API and signed webhooks. Provider-specific cards must not claim one-click/native support unless a real authorization and data-sync flow exists.

Airavata should be presented as cross-industry, not ecommerce-only; examples include retail, restaurants, clinics, schools, and services.

**Why:** The user asked for an approach that is easy for customers and broadly compatible, and said the product serves businesses beyond ecommerce. HTTP APIs and signed callbacks provide broad system reach without implying separate OAuth connectors already exist.

**How to apply:** Use business examples as inclusive, not exhaustive. Prefer expanding shared API/webhook contracts and clear setup guides before building native vendor integrations; keep credentials tenant-bound and server-side.