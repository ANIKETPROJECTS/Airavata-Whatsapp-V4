import assert from "node:assert/strict";
import test from "node:test";
import { extractInboundMedia } from "./inboundMedia";

test("captures an inbound image ID and its caption", () => {
  assert.deepEqual(
    extractInboundMedia({
      type: "image",
      image: { id: "image-123", caption: "Product photo" },
    }),
    {
      mediaType: "image",
      mediaId: "image-123",
      body: "Product photo",
    },
  );
});

test("captures an inbound video ID and uses a fallback conversation label", () => {
  assert.deepEqual(
    extractInboundMedia({
      type: "video",
      video: { id: "video-123" },
    }),
    {
      mediaType: "video",
      mediaId: "video-123",
      body: "[Video]",
    },
  );
});

test("captures inbound document IDs, filenames, and captions", () => {
  assert.deepEqual(
    extractInboundMedia({
      type: "document",
      document: { id: "document-123", filename: "invoice.pdf", caption: "Invoice" },
    }),
    {
      mediaType: "document",
      mediaId: "document-123",
      mediaFilename: "invoice.pdf",
      body: "Invoice",
    },
  );
});

test("captures inbound audio IDs and ignores non-media messages", () => {
  assert.deepEqual(
    extractInboundMedia({
      type: "audio",
      audio: { id: "audio-123" },
    }),
    {
      mediaType: "audio",
      mediaId: "audio-123",
      body: "[Audio]",
    },
  );
  assert.equal(extractInboundMedia({ type: "text" }), null);
});
