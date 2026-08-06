---
name: Chatbot condition edge handles
description: Branch edges from condition nodes must carry the matching sourceHandle for runtime execution.
---

Chatbot condition branches require each outgoing edge to store the exact condition handle (`true` or `false`); a visually connected edge without that handle is ignored by the execution engine.

**Why:** The Book Appointment branch appeared connected in the editor but stopped before sending the WhatsApp Flow because its edge had no `true` handle.

**How to apply:** When creating or repairing condition branches, verify both the source handle and the runtime edge lookup, not only the canvas connection.