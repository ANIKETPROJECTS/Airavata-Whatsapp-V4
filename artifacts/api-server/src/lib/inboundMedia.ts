export type InboundMediaType = "image" | "video" | "document" | "audio";

interface MediaPayload {
  id?: string;
  caption?: string;
  filename?: string;
}

export interface InboundMediaMessage {
  type: string;
  image?: MediaPayload;
  video?: MediaPayload;
  document?: MediaPayload;
  audio?: MediaPayload;
}

export interface InboundMediaRecord {
  mediaType: InboundMediaType;
  mediaId?: string;
  mediaFilename?: string;
  body: string;
}

export function extractInboundMedia(message: InboundMediaMessage): InboundMediaRecord | null {
  switch (message.type) {
    case "image":
      return {
        mediaType: "image",
        mediaId: message.image?.id,
        body: message.image?.caption?.trim() || "[Image]",
      };
    case "video":
      return {
        mediaType: "video",
        mediaId: message.video?.id,
        body: message.video?.caption?.trim() || "[Video]",
      };
    case "document":
      return {
        mediaType: "document",
        mediaId: message.document?.id,
        mediaFilename: message.document?.filename,
        body: message.document?.caption?.trim() || "[Document]",
      };
    case "audio":
      return {
        mediaType: "audio",
        mediaId: message.audio?.id,
        body: "[Audio]",
      };
    default:
      return null;
  }
}
