---
name: OpenAPI search request codegen
description: Avoid generated-client type collisions for search endpoints.
---

For read-only search endpoints that need several optional filters, use a named JSON request schema rather than GET query parameters when the code generator emits duplicate shared parameter types. Orval also clears generated output before rewriting it, so live app watchers may briefly report missing generated modules during codegen.

**Why:** The generated client produced a duplicate parameter-type export for the chatbot run search, while a typed POST request body generated cleanly. Concurrent Vite/Metro watchers can hit the temporary empty output directory.

**How to apply:** Model complex searches with an explicit request-body schema, regenerate the client, and use the generated types and client call rather than editing generated files. If watchers report missing generated modules during a successful regeneration, restart them after codegen completes.