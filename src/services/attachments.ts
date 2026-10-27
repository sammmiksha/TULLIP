import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { Attachment } from '../domain/types';
import { MAX_RECEIPT_BYTES, validateReceiptAttachment, validateReceiptDataUrl, validateReceiptPath } from '../domain/receipts';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function toDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}

export async function storeReceipt(file: File | Blob, name = 'receipt.jpg'): Promise<Attachment> {
  if (file.size > MAX_RECEIPT_BYTES) throw new Error('This receipt is over 12 MB. Choose a smaller image.');
  const attachment: Attachment = { id: id(), name, mimeType: file.type, size: file.size, createdAt: now(), updatedAt: now() };
  validateReceiptAttachment(attachment);
  const dataUrl = await toDataUrl(file);
  validateReceiptDataUrl(dataUrl, attachment.mimeType, attachment.size);
  if (Capacitor.isNativePlatform()) {
    const path = `receipts/${attachment.id}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    validateReceiptPath(path);
    await Filesystem.writeFile({ path, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
    return { ...attachment, nativePath: path };
  }
  return { ...attachment, dataUrl };
}

export async function receiptDataUrl(attachment: Attachment): Promise<string | undefined> {
  validateReceiptAttachment(attachment);
  if (attachment.dataUrl) return attachment.dataUrl;
  if (!attachment.nativePath) return undefined;
  const result = await Filesystem.readFile({ path: attachment.nativePath, directory: Directory.Data });
  if (typeof result.data !== 'string') throw new Error('The receipt image could not be read from local storage.');
  // Some native encoders wrap base64 lines; whitespace changes no image bytes.
  const dataUrl = `data:${attachment.mimeType};base64,${result.data.replace(/[\t\n\f\r ]/g, '')}`;
  validateReceiptDataUrl(dataUrl, attachment.mimeType, attachment.size);
  return dataUrl;
}

export async function pickNativeReceipt(): Promise<{ blob: Blob; name: string } | null> {
  const result = await Camera.pickImages({ quality: 85, limit: 1 });
  const photo = result.photos[0]; if (!photo?.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob(); return { blob, name: `receipt-${Date.now()}.jpg` };
}

export async function eraseNativeReceipt(attachment?: Attachment) {
  if (attachment?.nativePath) {
    validateReceiptPath(attachment.nativePath);
    if (Capacitor.isNativePlatform()) await Filesystem.deleteFile({ path: attachment.nativePath, directory: Directory.Data });
  }
}
