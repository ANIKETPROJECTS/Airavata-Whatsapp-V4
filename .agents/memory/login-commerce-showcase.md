---
name: Interactive commerce login showcase
description: Required behavior for the customer-facing WhatsApp commerce demo on the public login page.
---

The showcase starts with the product template already displayed. Website visitors drive the journey: Know More reveals product details; Buy Now opens a WhatsApp Flow-style checkout; submitting delivery details generates a receipt and simulated payment link. Keep the journey local and do not send details, create real orders, or initiate payments.

The phone should look like a WhatsApp iOS conversation rather than a generic chat: use the business header, chat wallpaper, outgoing and incoming bubble conventions, delivery/read details, and a composer anchored above the device safe area with plus, message field, camera, and microphone controls. Keep replay controls out of the composer.

Use the user's reference screenshot and their Figma file at https://www.figma.com/design/xLspw9pHlJHACcywueARFE/WhatsApp-UI-Screens--Community-?node-id=0-8102 as the primary visual references; do not improvise WhatsApp chrome from generic chat libraries. The file is a community screen set, not a drop-in React library. Check its license before reusing exported assets. Meta's official WhatsApp resource covers brand assets, not an app UI kit, and no official React UI library was found. Do not copy personal chat text or contact details from the screenshot.

**Why:** The login-page demo is meant to let prospective customers personally try an end-to-end example; a timed scripted walkthrough misses this goal.

**How to apply:** Keep explicit user-controlled states and a replay path. Before changing the phone UI, compare it against the user's screenshot and the linked Figma screens; preserve recognizable iOS WhatsApp chat structure while keeping commerce actions functional. Never auto-advance through customer actions or call production messaging or payment services from this preview.