---
name: Meta conversation analytics
description: Meta Graph API quirks for Partner Insights-style conversation counts and charges
---

Meta Graph API uses different granularity values for its WABA analytics fields: `analytics` accepts `DAY`, while `conversation_analytics` accepts `DAILY`. The current conversation analytics dimensions accept `CONVERSATION_CATEGORY` but reject `CURRENCY`; charge and currency fields should be treated as optional. Meta may return a successful response without a conversation analytics block when the selected period has no billing data, and response nesting can vary between direct `data_points` and `data[].data_points`.

**Why:** A combined request with the same granularity or an unsupported currency dimension fails even though each analytics family is independently valid.

**How to apply:** Keep messaging and conversation requests separate, use the field-specific enum/dimensions, and render empty/unknown charge data explicitly rather than treating it as an API failure.