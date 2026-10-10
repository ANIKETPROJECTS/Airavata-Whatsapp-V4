---
name: Orval email schema compatibility
description: Compatibility detail for OpenAPI email formats in generated Zod schemas.
---

When generating the shared API clients and Zod validators, avoid OpenAPI `format: email` unless the Orval Zod output and workspace Zod version are confirmed compatible. Orval emitted `zod.email()` while this workspace uses Zod 3.25, which failed typechecking.

**Why:** A generated schema can fail the entire library typecheck even though the OpenAPI is valid.

**How to apply:** Keep generated email fields as plain strings and enforce email validation at the owning API or form boundary until the generator and Zod versions are upgraded together.
