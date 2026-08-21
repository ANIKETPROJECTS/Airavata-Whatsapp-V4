---
name: Tenant notifications
description: Notifications are tenant-scoped records synchronized from real workspace activity and exposed through the shared notification center.
---

Never seed the notification UI with placeholder records. The notification feed is tenant-scoped, deduplicates source events, and derives activity from actual inbound messages, failed deliveries, failed campaigns, and template approval states. Read state is persisted per notification.

**Why:** A static dropdown creates false activity and cannot support reliable unread counts, filtering, or cross-session read state.

**How to apply:** Add new notification sources through a stable dedupe key and action URL, then keep the bell preview and `/notifications` page backed by the same query cache.