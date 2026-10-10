---
name: Expo Go media saving
description: Choose an attachment-save path that works when Expo Go lacks MediaLibraryNext.
---

In this SDK setup, Expo Go may not include the `ExpoMediaLibraryNext` native module. Importing `expo-media-library` can crash the chat route, and Expo Router may then report a misleading missing default export.

**Why:** Expo Go's native runtime is fixed and does not contain every native module present in the JavaScript dependency tree.

**How to apply:** If the app must run in Expo Go, use `expo-sharing` to let the operating system save or share downloaded files instead of importing MediaLibrary. Direct photo-library writes require a compatible custom native build; do not make a shared route depend on the module at import time.
