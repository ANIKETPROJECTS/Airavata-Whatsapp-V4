---
name: Interactive commerce login showcase
description: Required behavior for the customer-facing WhatsApp commerce demo on the public login page.
---

The showcase starts with the product template already displayed. Website visitors drive the journey: Know More reveals product details; Buy Now opens a WhatsApp Flow-style checkout; submitting delivery details generates a receipt and simulated payment link. Keep the journey local and do not send details, create real orders, or initiate payments.

**Why:** The login-page demo is meant to let prospective customers personally try an end-to-end example; a timed scripted walkthrough misses this goal.

**How to apply:** Keep explicit user-controlled states and a replay path. Never auto-advance through customer actions or call production messaging or payment services from this preview.