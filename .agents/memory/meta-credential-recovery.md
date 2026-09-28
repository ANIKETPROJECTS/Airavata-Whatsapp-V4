---
name: Meta credential recovery
description: Safe reconnect and recovery behavior for encrypted tenant WhatsApp credentials.
---

Never remove a working Meta credential before a replacement Embedded Signup has completed and the new encrypted credential has been saved. A legacy credential may be restored only after an explicit user action, by the authenticated owner, and only when that owner's tenant database has no credential.

**Why:** Clearing credentials before opening signup leaves the workspace disconnected if the user cancels or Meta rejects the flow. The old shared-database copy can survive tenant migration, but it must not overwrite newer tenant credentials or expose token material.

**How to apply:** Keep the existing credential through reconnect attempts. For legacy recovery, query by the authenticated user ID, verify the encrypted value can be decrypted, copy it without returning or logging credential contents, and activate the user's connection only after the copy succeeds.