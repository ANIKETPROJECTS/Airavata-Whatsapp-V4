---
name: Expo media-library platform split
description: Avoid importing Expo MediaLibrary's native module into the web bundle.
---

In this SDK setup, a static `expo-media-library` import in a shared Expo screen can make the web bundle fail with a missing `ExpoMediaLibraryNext` native module, even when the call is guarded by `Platform.OS`.

**Why:** Web bundling evaluates imports before runtime platform checks, while the media library's native module is unavailable in the web runtime.

**How to apply:** Put native media-library calls in a `.native.ts` helper and provide a `.web.ts` fallback; import the helper without a platform suffix. Verify both Expo web bundling and native TypeScript compilation.
