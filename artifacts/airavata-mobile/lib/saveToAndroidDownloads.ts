import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

const DIRECTORY_KEY = 'airavata-download-directory-uri';
const BASE64_CHUNK_BYTES = 768 * 1024;

export async function saveToAndroidDownloads(
  sourceUri: string,
  filename: string,
  mediaType: 'image' | 'video' | 'audio' | 'document',
): Promise<'saved' | 'cancelled'> {
  const directoryUri = await getDownloadsDirectory();
  if (!directoryUri) return 'cancelled';

  const fileInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!fileInfo.exists || typeof fileInfo.size !== 'number') {
    throw new Error('The downloaded attachment is unavailable.');
  }

  const extensionIndex = filename.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex).toLowerCase() : '';
  const mimeType = mimeTypeFor(extension, mediaType);
  const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    mimeType === 'application/octet-stream' ? filename : baseName,
    mimeType,
  );

  for (let position = 0; position < fileInfo.size; position += BASE64_CHUNK_BYTES) {
    const length = Math.min(BASE64_CHUNK_BYTES, fileInfo.size - position);
    const chunk = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });
    await FileSystem.StorageAccessFramework.writeAsStringAsync(destinationUri, chunk, {
      encoding: FileSystem.EncodingType.Base64,
      append: position > 0,
    });
  }

  return 'saved';
}

function mimeTypeFor(extension: string, mediaType: 'image' | 'video' | 'audio' | 'document'): string {
  const byExtension: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
  };
  return byExtension[extension] ??
    (mediaType === 'image' ? 'image/jpeg' :
      mediaType === 'video' ? 'video/mp4' :
        mediaType === 'audio' ? 'audio/mp4' : 'application/octet-stream');
}

async function getDownloadsDirectory(): Promise<string | null> {
  const rememberedUri = await SecureStore.getItemAsync(DIRECTORY_KEY);
  if (rememberedUri) return rememberedUri;

  const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const selection = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
  if (!selection.granted) return null;

  await SecureStore.setItemAsync(DIRECTORY_KEY, selection.directoryUri);
  return selection.directoryUri;
}
