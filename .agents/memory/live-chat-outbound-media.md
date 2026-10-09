---
name: Outbound media history
description: Product requirement for outbound image and video messages in tenant Live Chat history.
---

Persist outbound image and video messages in the sending tenant's MongoDB message history with the exact media reference used for delivery: Meta media ID or a public source URL. This applies to template test and campaign sends, chatbot template and media-reply nodes, and template sends through the developer API. Live Chat must render Meta IDs through the authenticated tenant media proxy and public URLs directly.

**Why:** The creator explicitly requires media sent to customers through templates and chatbot flows to appear in Live Chat and remain associated with the correct tenant's messages.

**How to apply:** When adding an outbound-media send path, save `mediaType` and its actual ID or URL with the outbound message, return that reference from the conversation history API, and make the renderer support both forms. Media binaries are not duplicated into MongoDB or local disk unless the creator explicitly asks for durable file archiving.
