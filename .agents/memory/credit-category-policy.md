---
name: Credit category policy
description: Product rule for WhatsApp credit charging by message type.
---

Only WhatsApp template sends are credit-charged. Authentication, Utility, and Marketing templates use their matching configurable rates. Plain session messages and other non-template outbound messages remain free.

**Why:** The product owner explicitly chose not to deduct credits from free-form session messages because they do not have a Meta template category.

**How to apply:** Pass a validated template category into the shared deduction helper. Leave category unset for non-template sends so the helper sends without reserving or recording credits.