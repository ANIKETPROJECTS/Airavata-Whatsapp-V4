import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(signature.slice(7), "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}
