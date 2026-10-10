export type GallerySaveResult = {
  saved: boolean;
  canAskAgain: boolean;
};

export async function saveMediaToGallery(_uri: string): Promise<GallerySaveResult> {
  return { saved: false, canAskAgain: true };
}
