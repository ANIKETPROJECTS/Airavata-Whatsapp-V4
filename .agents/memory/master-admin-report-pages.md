---
name: Master Admin report pages
description: The Master Admin report area uses dedicated per-user routes for detailed account reporting.
---

Each Master Admin user report should be opened as its own navigable route rather than rendered inline below the user list.

**Why:** Per-user reports contain enough usage, balance, account, and transaction detail to require a focused workspace and a shareable browser URL.

**How to apply:** Keep the reports index at `/MasterAdmin/reports` and use `/MasterAdmin/reports/:userId` for the detailed report view. Keep the report API scoped to the selected user and never include secrets.