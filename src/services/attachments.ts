import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { Attachment } from '../domain/types';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function toDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}

export async function storeReceipt(file: File | Blob, name = 'receipt.jpg'): Promise<Attachment> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file for the receipt.');
  if (file.size > 12 * 1024 * 1024) throw new Error('This receipt is over 12 MB. Choose a smaller image.');
  const attachment: Attachment = { id: id(), name, mimeType: file.type, size: file.size, createdAt: now(), updatedAt: now() };
  const dataUrl = await toDataUrl(file);
  if (Capacitor.isNativePlatform()) {
    const path = `receipts/${attachment.id}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await Filesystem.writeFile({ path, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
    return { ...attachment, nativePath: path };
  }
  return { ...attachment, dataUrl };
}

export async function receiptDataUrl(attachment: Attachment): Promise<string | undefined> {
  if (attachment.dataUrl) return attachment.dataUrl;
  if (!attachment.nativePath) return undefined;
  const result = await Filesystem.readFile({ path: attachment.nativePath, directory: Directory.Data });
  return `data:${attachment.mimeType};base64,${result.data}`;
}

export async function pickNativeReceipt(): Promise<{ blob: Blob; name: string } | null> {
  const result = await Camera.pickImages({ quality: 85, limit: 1 });
  const photo = result.photos[0]; if (!photo?.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob(); return { blob, name: `receipt-${Date.now()}.jpg` };
}

export async function eraseNativeReceipt(attachment?: Attachment) {
  if (attachment?.nativePath && Capacitor.isNativePlatform()) await Filesystem.deleteFile({ path: attachment.nativePath, directory: Directory.Data });
}
