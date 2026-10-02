---
name: Customer integration direction
description: Product direction for connecting Airavata to customer CRMs, ERPs, websites, and automation tools.
---

Airavata's customer integrations should work for any HTTP-capable CRM, ERP, website, or automation tool through a tenant-scoped API and signed webhooks. Provider-specific cards must not claim one-click/native support unless a real authorization and data-sync flow exists.

**Why:** The user asked for an approach that is easy for customers and broadly compatible. HTTP APIs and signed callbacks provide that reach without exposing Meta access tokens or pretending separate OAuth connectors already exist.

**How to apply:** Prefer expanding the shared API/webhook contracts and clear HTTP setup guides before building native vendor integrations. Keep credentials tenant-bound and server-side.