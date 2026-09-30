---
name: WhatsApp Flow inline images
description: Distinguishes static images embedded in Flow JSON from template media and customer-uploaded files.
---

For WhatsApp Flow `Image` controls, store PNG/JPEG image data in the Flow configuration and compile it as inline base64. Do not replace it with a hosted URL or a template-media upload handle. Treat `PhotoPicker` and `DocumentPicker` as separate customer-upload components.

**Why:** Meta's Flow JSON expects inline image content for the `Image` component; template headers use a different resumable-upload mechanism, while picker responses are runtime uploads.

**How to apply:** Keep server-side format and size validation on Flow saves and publishing. Do not conflate static builder assets with customer upload delivery or template media.