---
name: Per-user MongoDB isolation
description: Tenant databases use stored business-name and phone identifiers with collision-safe normalization, a central control plane, and idempotent migration.
---

Use the stored business name plus the normalized phone number as the physical tenant database identifier after safe normalization; append a short immutable user-ID suffix only for collisions. Keep authentication, the user registry, and global credit settings in the control-plane database; route workspace models through an async tenant context and per-database model registration. Existing shared records are copied by user ID, verified by collection counts, and only then considered migrated.

**Why:** The database should be recognizable to workspace administrators, while same-name users remain distinguishable and later business-name or phone edits must not move live data unexpectedly. Mongoose population also requires all referenced tenant models to be registered on each per-user connection.

**How to apply:** Resolve tenant context only from verified authentication or webhook phone-number ownership. Never accept a database name from the client, and preserve idempotent migration markers so restarts can retry safely.

Business-name edits now require a copy-and-verify tenant database move before the stored tenant name changes; the old database is dropped only after verification succeeds.

**Why:** The physical name is user-visible, but changing it must not orphan or partially move workspace data.

**How to apply:** Keep tenant renames server-side and perform them from the control-plane user update flow; never rename based on a client-supplied database name.