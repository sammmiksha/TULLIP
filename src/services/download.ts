import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** The user chooses the destination; exporting never uploads automatically. */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (Capacitor.getPlatform() === 'android') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    const path = `exports/${crypto.randomUUID()}/${safeName}`;
    const result = await Filesystem.writeFile({ path, data: btoa(binary), directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: 'TULLIP private export', url: result.uri, dialogTitle: 'Save or share your TULLIP export' });
    } finally {
      // Give the chosen app time to read its granted content URI. Cache is app-private.
      window.setTimeout(() => { void Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }, 5 * 60_000);
    }
    return;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob); link.href = url; link.download = safeName;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
