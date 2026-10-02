---
name: Meta catalog permissions
description: Required Facebook Login for Business scopes and access checks for tenant-owned WhatsApp catalogs.
---

Meta catalog listing and management for client-owned businesses requires a usable `business_management` grant; catalog create/update/delete additionally requires `catalog_management`. Meta lists `catalog_management` as dependent on `business_management`, and `business_management` on `pages_read_engagement` and `pages_show_list`. The Facebook Login for Business configuration determines the permissions requested during signup. Apps serving businesses they do not own/manage need Advanced Access through App Review. After the app configuration or approval changes, each client must reconnect so the updated grants can be issued. A permission-denied Graph error does not by itself prove that the client lacks a business-admin role; check app configuration, review status, granted scopes, and asset access.

**Why:** WhatsApp Embedded Signup's common messaging permissions do not automatically authorize business-owned catalog APIs, and existing customer tokens do not gain newly approved permissions retroactively.

**How to apply:** For catalog Graph errors about `business_management`, inspect the active Login for Business configuration and its approval/access levels, then have the affected client reconnect. Keep every catalog request bound to that tenant's stored credentials; never fall back to shared operator credentials.