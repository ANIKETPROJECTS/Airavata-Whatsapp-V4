import type { GallerySaveResult } from './saveMediaToGallery';

export async function saveMediaToGallery(_uri: string): Promise<GallerySaveResult> {
  return { saved: false, canAskAgain: true };
}
