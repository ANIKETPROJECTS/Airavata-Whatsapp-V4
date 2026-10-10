---
name: Expo media-library platform split
description: Avoid importing Expo MediaLibrary's native module into the web bundle.
---

In this SDK setup, Expo Go can lack the `ExpoMediaLibraryNext` native module. A static `expo-media-library` import then crashes route evaluation (Expo Router may also report the route has no default export), even when calls are guarded by `Platform.OS`.

**Why:** Module resolution/evaluation happens before a screen can catch the runtime failure, and Expo Go's native runtime may not include this module.

**How to apply:** Keep media-library access in a `.native.ts` helper and load the module dynamically inside `try/catch`; on failure, return an unsupported result and use Expo Sharing as a fallback. Provide a `.web.ts` helper and import the helper without a platform suffix. Verify web bundling and typecheck; test the fallback in Expo Go.
