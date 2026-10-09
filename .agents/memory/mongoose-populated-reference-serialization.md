---
name: Mongoose populated reference serialization
description: Keep populated MongoDB references compatible with frontend payloads that expect string id fields.
---

When returning populated Mongoose documents inside a JSON response, do not assume the `id` virtual will be serialized. Normalize each reference explicitly to a stable string `id` derived from `_id`, plus only the display fields the client needs.

**Why:** Mongoose's nested document JSON output can contain `_id` without `id`; a client reading `ref.id` then creates undefined selections, and an unrelated malformed group value can reject a whole profile save.

**How to apply:** For API responses consumed by browser forms, map populated tag/group references to explicit `{ id, name, ... }` objects. Include a fallback for legacy singular references when the modern reference array is empty.
