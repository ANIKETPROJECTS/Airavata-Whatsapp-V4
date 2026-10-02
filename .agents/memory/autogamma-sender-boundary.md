---
name: AutoGamma sender boundary
description: Scope rule for mirroring AutoGamma WhatsApp sends into Airavata Live Chat.
---

AutoGamma remains the source of truth for sending. Airavata's integration accepts only post-send records and must not call Meta, resend, backfill, enroll trigger campaigns, or emit contact-created events for those records.

**Why:** The ingestion path is informational. Trigger enrollment or contact-created callbacks can cause duplicate or echoed sends and would move send ownership away from AutoGamma.

**How to apply:** Keep integration work scoped to authentication, persistence, and status matching. When creating a Live Chat contact for an externally sent message, suppress contact-created send side effects.