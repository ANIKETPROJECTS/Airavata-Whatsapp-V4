---
name: Auth query cache isolation
description: Preventing one tenant’s cached React Query data from appearing during another tenant’s session.
---

When the authenticated user changes, cancel and clear the client query cache before rendering the new session, and remount the protected shell using the user identity as its key.

**Why:** Shared query keys such as campaigns, contacts, and message stats can otherwise display the previous tenant’s cached data briefly while the new tenant’s requests are loading.

**How to apply:** Any new user-scoped client cache or persistent page state must either be cleared on auth transitions or include the immutable user ID in its cache/remount boundary.