import assert from "node:assert/strict";
import test from "node:test";
import { getTemplateMessageMediaFields } from "./templateComponents";

test("keeps an image media ID from a template header for Live Chat", () => {
  const fields = getTemplateMessageMediaFields([
    {
      type: "header",
      parameters: [{ type: "image", image: { id: "meta-media-123" } }],
    },
  ]);

  assert.deepEqual(fields, { mediaType: "image", mediaId: "meta-media-123" });
});

test("keeps a public video URL from a template header for Live Chat", () => {
  const fields = getTemplateMessageMediaFields([
    {
      type: "HEADER",
      parameters: [{
        type: "video",
        video: { link: "https://media.example.com/customer-demo.mp4" },
      }],
    },
  ]);

  assert.deepEqual(fields, {
    mediaType: "video",
    mediaUrl: "https://media.example.com/customer-demo.mp4",
  });
});

test("does not invent media metadata for text-only templates", () => {
  assert.deepEqual(
    getTemplateMessageMediaFields([{ type: "body", parameters: [{ type: "text", text: "Hi" }] }]),
    {},
  );
});
