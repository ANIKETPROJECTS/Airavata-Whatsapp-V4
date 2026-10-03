---
name: Router middleware scope
description: Keep authorization middleware limited to the routes owned by a router mounted at the API root.
---

When a router is mounted at the API root, scope authorization middleware to that router's own URL prefix. An unqualified `router.use(authenticate, requireAdmin)` can run for every request that falls through that router and reject unrelated endpoints mounted later.

**Why:** A root-mounted admin router's global guard blocked ordinary tenant access to WA Pay and other routes registered after it.

**How to apply:** Before adding router-wide auth or role checks, verify the router's mount path and guard all local paths under its own namespace. Preserve authentication and role enforcement for the intended protected endpoints.