---
name: Chatbot activity history
description: Product constraints for the per-chatbot run-history experience.
---

Keep chatbot run history metadata-only: identify the run, tenant, flow, contact, source message, trigger, status, and timestamps, while leaving message content in the existing Live Chat transcript. Activity links must open that full existing conversation rather than duplicating messages. Keep the chatbot list and activity view flat and consistent with the module’s existing typography.

**Why:** The user asked for low-growth activity storage, no duplicate message content, and continuity with the existing chatbot visual language.

**How to apply:** When extending chatbot activity, store operational metadata only, keep every query tenant-scoped, link to Live Chat for transcript content, and preserve the flat list presentation.