---
name: Template date semantics
description: Keep template creation dates stable while refreshing live Meta template status.
---

Manage Templates should show the local `createdAt` timestamp when the UI means “created.” Meta's current message-template query does not request a creation timestamp, so do not label a local `updatedAt` value as Meta's creation date. Mongoose `bulkWrite` updates `updatedAt` by default; background status/component synchronization must use `timestamps: false` or avoid writing unchanged documents.

**Why:** Opening the template list refreshed every matching template and made all cards appear to share the current date, even though their local creation times differed.

**How to apply:** Keep status refreshes from mutating user-facing content timestamps, and explicitly distinguish creation date from last update wherever both are shown.