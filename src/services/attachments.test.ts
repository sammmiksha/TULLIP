import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import type { Attachment, BackupFile } from '../domain/types';
import { makeDefaultSettings } from '../domain/defaults';
import { eraseNativeReceipt, receiptDataUrl, storeReceipt } from './attachments';
import { validateBackup } from '../storage/repository';
import { MAX_RECEIPT_BYTES, validateReceiptAttachment, validateReceiptDataUrl, validateReceiptPath } from '../domain/receipts';

const nativeFiles = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Filesystem: nativeFiles }));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5/0AAAAASUVORK5CYII=';
const localReceipt = (fields: Partial<Attachment> = {}): Attachment => ({
  id: 'synthetic-receipt', name: 'synthetic.png', mimeType: 'image/png', size: atob(PNG).length,
  dataUrl: `data:image/png;base64,${PNG}`, createdAt: '', updatedAt: '', ...fields,
});
const backupWith = (attachment: Attachment): BackupFile => ({ app: 'TULLIP', schemaVersion: 1, exportedAt: '', data: {
  transactions: [], categories: [], paymentMethods: [], budgets: [], wishlistItems: [], savingsContributions: [], attachments: [attachment], settings: makeDefaultSettings(),
} });
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); nativeFiles.readFile.mockResolvedValue({ data: PNG }); });

describe('local receipt privacy boundaries', () => {
  it('rejects an imported remote image URL before it can become an img source', async () => {
    const remote = localReceipt({ dataUrl: 'https://example.invalid/private-receipt.png' });
    await expect(receiptDataUrl(remote)).rejects.toThrow(/local|data|receipt/i);
    expect(() => validateBackup(backupWith(remote))).toThrow(/receipt|attachment/i);
    expect(nativeFiles.readFile).not.toHaveBeenCalled();
  });
  it('rejects a native path escaping receipts before any read or delete', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const escaped = localReceipt({ dataUrl: undefined, nativePath: 'receipts/../tullip_privacy.xml' });
    await expect(receiptDataUrl(escaped)).rejects.toThrow(/receipt|path/i);
    await expect(eraseNativeReceipt(escaped)).rejects.toThrow(/receipt|path/i);
    expect(() => validateBackup(backupWith(escaped))).toThrow(/receipt|path/i);
    expect(nativeFiles.readFile).not.toHaveBeenCalled(); expect(nativeFiles.deleteFile).not.toHaveBeenCalled();
  });
  it('preserves a valid existing base64 image and its metadata unchanged', async () => {
    const image = localReceipt(); const before = structuredClone(image);
    expect(await receiptDataUrl(image)).toBe(image.dataUrl); expect(() => validateBackup(backupWith(image))).not.toThrow();
    const v2 = backupWith(image); v2.schemaVersion = 2; v2.data.accounts = [];
    expect(() => validateBackup(v2)).not.toThrow();
    expect(image).toEqual(before); expect(nativeFiles.readFile).not.toHaveBeenCalled();
  });
  it('keeps legacy image MIME subtypes supported and preserves a valid SVG in image context', async () => {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/tiff', 'image/x-icon']) {
      const attachment = localReceipt({ mimeType, dataUrl: `data:${mimeType};base64,${PNG}` });
      expect(await receiptDataUrl(attachment)).toBe(attachment.dataUrl);
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
    const image = localReceipt({ name: 'legacy.svg', mimeType: 'image/svg+xml', size: svg.length, dataUrl: `data:image/svg+xml;base64,${btoa(svg)}` });
    expect(await receiptDataUrl(image)).toBe(image.dataUrl); expect(() => validateBackup(backupWith(image))).not.toThrow();
  });
  it('rejects non-image schemes, MIME mismatches and malformed base64', async () => {
    for (const dataUrl of ['javascript:alert(1)', 'blob:https://example.invalid/blob', 'file:///private/image.png', 'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=', `data:image/jpeg;base64,${PNG}`, 'data:image/png;base64,%%%', 'data:image/png;base64,A===', 'data:image/png;base64,A', 'data:image/png;base64,AA\n']) {
      await expect(receiptDataUrl(localReceipt({ dataUrl }))).rejects.toThrow(/receipt/i);
    }
    await expect(receiptDataUrl(localReceipt({ mimeType: 'text/html' }))).rejects.toThrow(/image MIME/i);
    expect(nativeFiles.readFile).not.toHaveBeenCalled();
  });
  it('enforces declared and actual decoded size limits before native access', async () => {
    await expect(receiptDataUrl(localReceipt({ size: MAX_RECEIPT_BYTES + 1 }))).rejects.toThrow(/12 MB/i);
    await expect(receiptDataUrl(localReceipt({ size: 1 }))).rejects.toThrow(/size.*match/i);
    expect(() => validateReceiptDataUrl(`data:image/png;base64,${'A'.repeat(Math.ceil(MAX_RECEIPT_BYTES / 3) * 4 + 4)}`, 'image/png', 1)).toThrow(/12 MB/i);
    for (const size of [-1, 1.5, Number.NaN]) expect(() => validateReceiptAttachment(localReceipt({ size }))).toThrow(/size/i);
    expect(nativeFiles.readFile).not.toHaveBeenCalled();
  });
  it('allows only safe receipt-relative paths and keeps metadata-only rows', async () => {
    for (const nativePath of ['../private.png', 'receipts/../private.png', 'receipts/sub/image.png', 'receipts\\image.png', '/receipts/image.png', 'file:///receipts/image.png', 'https://example.invalid/image.png', 'receipts/%2e%2e%2fprivate.png', 'receipts/image.png?token=x', 'receipts/image.png\n', 'receipts/.', 'receipts/..']) {
      expect(() => validateReceiptPath(nativePath)).toThrow(/receipt|path/i);
    }
    const native = localReceipt({ dataUrl: undefined, nativePath: 'receipts/123e4567-e89b-12d3-a456-426614174000-invoice..png' });
    expect(await receiptDataUrl(native)).toBe(`data:image/png;base64,${PNG}`);
    expect(nativeFiles.readFile).toHaveBeenCalledWith({ path: native.nativePath, directory: 'DATA' });
    expect(await receiptDataUrl(localReceipt({ dataUrl: undefined, nativePath: undefined }))).toBeUndefined();
    expect(() => validateBackup(backupWith(native))).not.toThrow();
  });
  it('checks native image bytes before returning a preview and checks safe paths before deletion', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const native = localReceipt({ dataUrl: undefined, nativePath: 'receipts/synthetic.png' });
    nativeFiles.readFile.mockResolvedValueOnce({ data: 'not base64!' });
    await expect(receiptDataUrl(native)).rejects.toThrow(/base64/i);
    nativeFiles.readFile.mockResolvedValueOnce({ data: `${PNG.slice(0, 20)}\n${PNG.slice(20)}\n` });
    expect(await receiptDataUrl(native)).toBe(`data:image/png;base64,${PNG}`);
    await eraseNativeReceipt(native); expect(nativeFiles.deleteFile).toHaveBeenCalledWith({ path: native.nativePath, directory: 'DATA' });
  });
  it('rejects non-image or oversized newly selected files before FileReader or storage', async () => {
    await expect(storeReceipt(new Blob(['<html/>'], { type: 'text/html' }))).rejects.toThrow(/image MIME/i);
    await expect(storeReceipt({ size: MAX_RECEIPT_BYTES + 1, type: 'image/png' } as Blob)).rejects.toThrow(/12 MB/i);
    expect(nativeFiles.writeFile).not.toHaveBeenCalled();
  });
  it('validates the entire backup before any custom-adapter writes', async () => {
    const { mergeInto } = await import('../storage/repository');
    const put = vi.fn(); const list = vi.fn().mockResolvedValue([]);
    const adapter = { put, list } as unknown as import('../storage/repository').Repository;
    const backup = backupWith(localReceipt({ dataUrl: 'https://example.invalid/private-receipt.png' }));
    backup.data.categories.push({ id: 'synthetic-category', name: 'Synthetic', kind: 'expense', color: '', sticker: '', createdAt: '', updatedAt: '' });
    await expect(mergeInto(adapter, backup)).rejects.toThrow(/receipt|attachment/i); expect(list).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  });
});
