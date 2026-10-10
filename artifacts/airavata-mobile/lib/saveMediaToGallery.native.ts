import * as MediaLibrary from 'expo-media-library';
import type { GallerySaveResult } from './saveMediaToGallery';

export async function saveMediaToGallery(uri: string): Promise<GallerySaveResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    return { saved: false, canAskAgain: permission.canAskAgain };
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return { saved: true, canAskAgain: true };
}
