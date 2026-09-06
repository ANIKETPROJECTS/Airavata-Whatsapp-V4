---
name: Meta template media uploads
description: The distinction between regular WhatsApp media IDs and template header example handles.
---

Template image, video, and document examples must use the handle returned by Meta's resumable `/uploads` flow, then be sent as `components[].example.header_handle`. The media ID from the phone-number `/media` endpoint is for message sending and is not the same reference.

**Why:** Meta uses separate upload flows for message attachments and template samples; using the regular media ID can make an otherwise valid template submission fail.

**How to apply:** Keep template header uploads tenant-scoped and strict-credentialed, validate type and size before upload, and clear any previously uploaded handle whenever the selected header type changes.