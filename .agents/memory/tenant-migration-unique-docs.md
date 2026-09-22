---
name: Tenant migration reconciliation
description: The invariant needed when copying tenant-scoped singleton documents between the control-plane and tenant databases.
---

One-per-tenant documents must reconcile by their unique logical `userId` key while preserving the target document's MongoDB `_id`; a partial migration can create equivalent records with different IDs.

**Why:** A startup migration that upserted only by `_id` hit unique `userId` indexes and prevented the API from starting, which surfaced to users as HTTP 502.

**How to apply:** When adding a singleton tenant collection to migration, handle existing target records by logical key, keep count verification, and test a partially migrated target before relying on startup migration.