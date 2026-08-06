---
name: Pricing label normalization
description: Pricing lookups must normalize punctuation and dash variants in both incoming WhatsApp labels and configured price keys.
---

Pricing values can arrive from WhatsApp using en dashes, em dashes, or hyphens, while configured service labels may use another dash character. Normalize both lookup input and table keys before matching.

**Why:** A valid service/category combination otherwise returns a null price when the visible labels differ only by dash punctuation.

**How to apply:** Keep normalization centralized in the pricing resolver and test with labels copied from actual WhatsApp replies or Flow submissions.