---
name: Failed campaign deletion
description: Safe deletion rules for failed campaign history and related send records.
---

Only final `FAILED` campaigns may be deleted from the tenant report. Deletion removes the campaign, recipients, send attempts, and campaign messages in one tenant-scoped transaction, while preserving contacts.

**Why:** A failed broadcast is disposable history, but contacts are workspace data and must not disappear as a side effect. Queued or active work must not be deleted while a worker may still claim it.

**How to apply:** Enforce ownership and final status on the server, reject queued/active recipients, cascade only campaign-owned records, and invalidate the report/detail caches after success.