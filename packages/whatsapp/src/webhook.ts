import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
