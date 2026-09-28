---
name: Contact CSV export
description: Encoding and phone-number behavior for contact CSV downloads.
---

Keep CSV exports standards-friendly: include a UTF-8 BOM, escape cells correctly, and leave phone values as ordinary strings. For direct spreadsheet viewing, provide a separate XLSX export with phone cells stored as text and display the same missing-name fallback used in the app.

**Why:** CSV has no column-type metadata, and formula-wrapped values can break re-imports. A name that is missing or identical to the phone number should display as `NA` without changing the saved contact record.

**How to apply:** Keep the raw CSV option for integrations and imports. Use XLSX for opening contacts in spreadsheet apps, explicitly store phone cells as strings, and do not invent names or mutate contact data to fix presentation.