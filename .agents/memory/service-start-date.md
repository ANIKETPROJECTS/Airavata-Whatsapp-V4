---
name: Service start date
description: Master Admin tracks each user’s editable service start date as a date-only value.
---

Service start dates are calendar dates, not timestamps. Store and exchange them as `YYYY-MM-DD` strings, require them when creating users, and allow editing or clearing them for existing users.

**Why:** Converting a service date to a timezone-aware timestamp can display the previous or next calendar day for administrators in different time zones.

**How to apply:** Use date inputs in Master Admin forms and display the stored date without applying timezone conversion.