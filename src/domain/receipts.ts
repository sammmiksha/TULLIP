import type { Attachment } from './types';

export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;
const isImageMime = (value: string) => /^image\/[a-z0-9][a-z0-9.+-]*$/i.exec(value)?.[0] === value;
function invalid(reason: string): never { throw new Error(`Invalid receipt attachment: ${reason}`); }

/** Matches paths produced by storeReceipt; no URL, nested path, encoding or traversal. */
export function validateReceiptPath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || /^receipts\/[a-z0-9._-]+$/i.exec(path)?.[0] !== path || ['.', '..'].includes(path.slice('receipts/'.length))) {
    invalid('use a relative file inside the app-private receipts folder.');
  }
}

/** FileReader stores local images as base64. Never return an imported URL as img.src.
 * Preserve image subtypes, including existing SVG receipts rendered only as images. */
export function validateReceiptDataUrl(value: unknown, mimeType: string, expectedSize?: number): asserts value is string {
  if (typeof value !== 'string') invalid('the image must be a local base64 data URL.');
  const comma = value.indexOf(',');
  const rawHeader = value.slice(0, comma);
  const header = rawHeader.match(/^data:(image\/[a-z0-9][a-z0-9.+-]*);base64$/i);
  if (comma < 0 || !header || header[0] !== rawHeader || !isImageMime(mimeType)) invalid('the image must be a local base64 image data URL.');
  if (header[1].toLowerCase() !== mimeType.toLowerCase()) invalid('the image MIME type does not match its metadata.');
  const encoded = value.slice(comma + 1);
  // Bound the payload before inspecting it, without allocating a decoded copy.
  if (encoded.length > Math.ceil(MAX_RECEIPT_BYTES / 3) * 4) invalid('the image exceeds the 12 MB receipt limit.');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (encoded.length % 4 === 1 || (padding > 0 && encoded.length % 4 !== 0) || /[^a-z0-9+/=]/i.test(encoded) || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) invalid('the local image contains invalid base64 data.');
  const decodedSize = Math.floor(encoded.length * 3 / 4) - padding;
  if (decodedSize > MAX_RECEIPT_BYTES) invalid('the image exceeds the 12 MB receipt limit.');
  if (expectedSize !== undefined && decodedSize !== expectedSize) invalid('the local image size does not match its metadata.');
}

export function validateReceiptAttachment(value: unknown): asserts value is Attachment {
  if (!value || typeof value !== 'object') invalid('receipt metadata is missing.');
  const attachment = value as Partial<Attachment>;
  if (typeof attachment.id !== 'string' || !attachment.id || typeof attachment.name !== 'string') invalid('receipt identification is missing.');
  if (typeof attachment.mimeType !== 'string' || !isImageMime(attachment.mimeType)) invalid('choose an image MIME type.');
  if (!Number.isSafeInteger(attachment.size) || attachment.size! < 0 || attachment.size! > MAX_RECEIPT_BYTES) invalid('the receipt size must be between 0 and 12 MB.');
  if (attachment.nativePath !== undefined) validateReceiptPath(attachment.nativePath);
  if (attachment.dataUrl !== undefined) validateReceiptDataUrl(attachment.dataUrl, attachment.mimeType, attachment.size);
  // Metadata-only rows remain valid: a backup may refer to a receipt absent on this device.
}
