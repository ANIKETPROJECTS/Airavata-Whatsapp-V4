---
name: WhatsApp Flow publish switch
description: Reversible Meta WhatsApp Flow publishing and the terminal DEPRECATED state.
---

For a reversible publish switch, return a published Flow to `DRAFT` by re-uploading its current Flow JSON asset; do not use Meta's `/deprecate` endpoint for an ordinary off/on control. Update the local status only after Meta accepts the asset.

**Why:** Meta's Flow lifecycle treats `DEPRECATED` as terminal, while updating a published Flow's JSON transitions it back to `DRAFT` and allows republishing.

**How to apply:** Use this for user-facing publish/unpublish controls. Keep the Flow ID and current JSON intact, surface Meta failures, and leave the local published state unchanged when the remote update fails.