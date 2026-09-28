---
name: Contact CSV export
description: Encoding and phone-number behavior for contact CSV downloads.
---

Contact CSV downloads should include a UTF-8 BOM and correctly escape CSV cells, while keeping phone values as ordinary strings. Spreadsheet apps may still convert a phone column to numeric notation when opening a CSV; guide users to import that column as text instead of wrapping CSV values in formulas.

**Why:** CSV has no column-type metadata. Formula-style cells may look right in Excel but break use as ordinary CSV data or when the file is imported elsewhere.

**How to apply:** Preserve canonical contact values in CSV exports. Use an explicit spreadsheet import with the phone column set to Text, or add a separate typed spreadsheet export if users need a file that opens without automatic formatting.