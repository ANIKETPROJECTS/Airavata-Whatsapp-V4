---
name: Meta template component structure
description: Durable rule for keeping campaign template parameters aligned with Meta approvals
---

Campaign template requirements must be derived from Meta’s live approved `components` response whenever available. Local template body/header fields are only a fallback because an approved template can change or be imported with incomplete local metadata.

**Why:** Meta rejects sends with error 131009 when the body parameter count, order, or required header component does not match the approved template, even when the local template appears to contain a variable.

**How to apply:** Sync and expose the approved components; validate all body variables and header text/media before campaign creation; construct body, text-header, image, video, and document parameters from that same structure.