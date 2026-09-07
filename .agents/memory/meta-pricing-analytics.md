---
name: Meta pricing analytics
description: Meta Graph API fields used to reproduce Partner Insights message pricing
---

Meta Partner Insights-style message pricing is provided by the WABA `pricing_analytics` field, not `conversation_analytics`. Request `currency` alongside `pricing_analytics` and use `DAILY` with `PRICING_CATEGORY`, `PRICING_TYPE`, and `COUNTRY` dimensions. Aggregate `volume` for message counts and `cost` for approximate charges. Inbound message totals come from `analytics` with `product_types(100)`.

**Why:** `conversation_analytics` can return a successful response without data even when Meta Partner Insights has paid/free message pricing data; `pricing_analytics` returns the category volumes and charges shown in Message pricing.

**How to apply:** Use separate messaging, inbound, and pricing analytics calls; treat charge/currency fields as optional and present the Meta values as approximate rather than final invoice amounts.