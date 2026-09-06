---
name: Service start date
description: Master Admin tracks each user’s editable service start date as a date-only value.
---

Service start dates and paid-through dates are calendar dates, not timestamps. Store and exchange them as `YYYY-MM-DD` strings, require the start date when creating users, and allow editing or clearing either date for existing users.

**Why:** Converting a service date to a timezone-aware timestamp can display the previous or next calendar day for administrators in different time zones.

**How to apply:** Use date inputs in Master Admin forms and display the stored dates without applying timezone conversion. Payment alerts should be live conditions: missing or past paid-through dates are actionable until the user record is updated.