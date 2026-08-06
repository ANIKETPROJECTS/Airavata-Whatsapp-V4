---
name: Service pricing catalog
description: Workspace-owned MongoDB pricing rows power built-in chatbot lookups and can be replaced from an XLSX workbook.
---

Service pricing is workspace data, not source-code configuration. The built-in chatbot pricing URL resolves against the current workspace catalog at runtime; the catalog accepts workbook columns named Service, Category, and Price.

**Why:** Businesses need to change service prices and labels without rebuilding or editing every chatbot flow.

**How to apply:** Keep chatbot pricing nodes pointed at `airavata://pricing/lookup` and map the response into variables such as `service_price`; manage prices from the Service Pricing workspace tab or import the workbook.