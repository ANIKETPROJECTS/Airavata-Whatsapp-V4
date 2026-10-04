---
name: Interactive commerce login showcase
description: Required behavior for the customer-facing WhatsApp commerce demo on the public login page.
---

The showcase starts with the product template already displayed. Website visitors drive the journey: Know More reveals product details; Buy Now opens a WhatsApp Flow-style checkout; submitting delivery details generates a receipt and simulated payment link. Keep the journey local and do not send details, create real orders, or initiate payments.

The phone should look like a WhatsApp iOS conversation rather than a generic chat: use the business header, chat wallpaper, outgoing and incoming bubble conventions, delivery/read details, and a composer anchored above the device safe area with plus, message field, camera, and microphone controls. Keep replay controls out of the composer.

Use the user's reference screenshot and the exact “Messages - Full view” Figma frame at https://www.figma.com/design/iv4OQSL1W7hEjQ2wlS8WdA/WhatsApp-Screens-2025-with-Meta-AI---UI-for-iOS--Community-?node-id=86-6042 as the primary visual reference. Open that frame itself, not just the board overview. When the user supplies an SVG export, use its available vectors as implementation assets instead of substituting generic icon-library or hand-drawn WhatsApp chrome. Check the file's license before reusing exported assets. Do not copy personal chat text or contact details from the screenshot.

Bubble fills and SVG tails need explicit stacking levels: keep the fill behind the tail, and text, timestamps, and product-card content above both. Negative-z-index tails disappeared behind opaque bubble layers in the preview. Incoming bubbles also need reserved room for the bottom-right timestamp so wrapped copy cannot run beneath it.

**Why:** The showcase must stay interactive and visually faithful; the user has repeatedly corrected icon-only matching and crop misalignment, emphasizing that typography, spacing, scale, and alignment matter too.

**How to apply:** Keep explicit user-controlled states and a replay path. Before changing the phone UI, inspect the linked Figma frame and supplied SVG; use available vectors directly and match typography, spacing, and proportions. For bubble layering, use positive z-levels for the fill, tail, and content instead of negative-z children. Reserve space for incoming timestamps. Before finishing, compare the rendered phone with the reference at a similar viewport and check that the header subtitle, date pill, bubbles, card, and composer align and remain visible. Keep app-specific commerce content interactive; do not copy personal conversation text. Never auto-advance through customer actions or call production messaging or payment services from this preview.