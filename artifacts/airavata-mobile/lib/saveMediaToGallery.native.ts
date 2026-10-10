import type { GallerySaveResult } from './saveMediaToGallery';

export async function saveMediaToGallery(uri: string): Promise<GallerySaveResult> {
  try {
    const MediaLibrary = await import('expo-media-library');
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      return { saved: false, canAskAgain: permission.canAskAgain, available: true };
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    return { saved: true, canAskAgain: true, available: true };
  } catch {
    // Expo Go may not include this optional native module; use the OS share sheet instead.
    return { saved: false, canAskAgain: true, available: false };
  }
}
