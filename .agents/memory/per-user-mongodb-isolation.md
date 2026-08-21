---
name: Per-user MongoDB isolation
description: Tenant databases use immutable user-ID names with a central control plane and idempotent copy-and-verify migration.
---

Use the server-generated user ID as the physical tenant database identifier, not the editable business name. Keep authentication, the user registry, and global credit settings in the control-plane database; route workspace models through an async tenant context and per-database model registration. Existing shared records are copied by user ID, verified by collection counts, and only then considered migrated.

**Why:** Business names can collide or change, while request-scoped model proxies need an immutable tenant key. Mongoose population also requires all referenced tenant models to be registered on each per-user connection.

**How to apply:** Resolve tenant context only from verified authentication or webhook phone-number ownership. Never accept a database name from the client, and preserve idempotent migration markers so restarts can retry safely.