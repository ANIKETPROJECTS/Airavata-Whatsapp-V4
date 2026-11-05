---
name: Shared React Query context
description: Keep generated workspace hooks on the same TanStack Query instance as the consuming app.
---

Shared frontend API-client packages should declare `@tanstack/react-query` as a peer dependency, not a regular dependency. The consuming app should own the version and provider instance, and Vite should deduplicate the package when workspace symlinks are involved.

**Why:** A separately resolved React Query copy owns a different context, so hooks fail with “No QueryClient set” even when the app has a correctly mounted provider.

**How to apply:** When generated hooks and app components share a `QueryClientProvider`, check both package peer dependencies and bundler deduplication before adding another provider.
