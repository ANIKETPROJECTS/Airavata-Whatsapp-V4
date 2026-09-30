---
name: Chatbot flow disable semantics
description: How chatbot unpublishing affects paused sessions and currently executing flows.
---

Moving a chatbot flow to DRAFT must clear matching sessions only for that tenant and flow. Execution must also recheck the flow's published status at each node boundary; blocking only new triggers leaves an already-running sequence active.

**Why:** Users expect disable/unpublish to stop new starts, resumed conversations, and in-progress execution. Clearing old sessions also prevents a stale conversation from unexpectedly resuming after republishing.

**How to apply:** Scope cleanup by authenticated tenant ID and flow ID, and retain a status freshness check between nodes. This adds one flow-status query per node; if performance becomes a concern, replace it only with a bounded freshness mechanism that preserves prompt disable behavior.