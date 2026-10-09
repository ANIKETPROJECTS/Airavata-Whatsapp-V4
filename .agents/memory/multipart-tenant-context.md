---
name: Multipart tenant context
description: Preserve tenant-scoped MongoDB access in routes that parse multipart uploads with Multer.
---

Do not rely only on authentication middleware to keep tenant AsyncLocalStorage active through Multer. Multer's multipart event callback can invoke the route handler outside the context that was active before parsing. Re-enter `runWithTenant` after parsing and wrap the route's tenant model access, provider send, and persistence in that context.

**Why:** A Live Chat media upload reached its handler after Multer but failed at the first tenant-model query with a missing tenant context, before sending the media.

**How to apply:** For authenticated multipart routes, keep authentication before Multer, then explicitly call `runWithTenant` inside the post-Multer handler using the verified `req.user.userId`.
