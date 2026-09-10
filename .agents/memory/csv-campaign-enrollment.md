---
name: CSV campaign enrollment
description: Tenant-safe rules for importing spreadsheet recipients into campaigns.
---

CSV campaign enrollment must resolve every normalized phone number against the tenant’s existing contacts before creating a contact. A matched blocked or unsubscribed contact is intentionally not replaced with a new active contact, and therefore is excluded from enrollment.

**Why:** Creating a second contact for a suppressed number would bypass opt-out and blocking safeguards.

**How to apply:** Normalize and deduplicate spreadsheet rows before enrollment, reuse existing records regardless of status, create only genuinely new contacts in the tenant database, and build recipients only from active contacts. When adding CSV request fields, update both the TypeScript request type and the runtime `req.body` destructuring; a type declaration does not create a runtime variable. If contacts are created inside a transaction, pass that session into the recipient read before committing.