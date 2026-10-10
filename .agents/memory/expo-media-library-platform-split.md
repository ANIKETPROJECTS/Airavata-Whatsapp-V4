---
name: Expo Go media saving
description: Save attachments in Expo Go without relying on the unavailable MediaLibraryNext native module.
---

In this SDK setup, Expo Go may not include the `ExpoMediaLibraryNext` native module. Importing `expo-media-library` can crash the chat route, and Expo Router may then report a misleading missing default export. The product requirement is a real file save, not an Android app-recipient share sheet.

**Why:** Expo Go's native runtime is fixed and does not contain every native module present in the JavaScript dependency tree; Android's Storage Access Framework is available for a user-approved save location.

**How to apply:** For Android downloads in Expo Go, use Storage Access Framework and remember the selected folder URI; for iOS/web use the system share/save sheet. Avoid statically importing MediaLibrary in a shared Expo route.
