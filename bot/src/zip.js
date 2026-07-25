import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';

function normalizeBase64(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeArchiveEntryName(value) {
  const cleaned = String(value || '').trim().replace(/[\\/]+/g, '_');
  return cleaned || 'attachment.bin';
}

export function zipTextToBase64(text) {
  const input = String(text || '').trim();
  if (!input) {
    return '';
  }

  const packed = gzipSync(Buffer.from(input, 'utf8'));
  return packed.toString('base64');
}

export function buildZipTextPayloadDetails(text) {
  const input = String(text || '').trim();
  if (!input) {
    return null;
  }

  const inputBuffer = Buffer.from(input, 'utf8');
  const gzipped = gzipSync(inputBuffer);

  return {
    payload: gzipped.toString('base64'),
    originalBytes: inputBuffer.length,
    gzipBytes: gzipped.length,
  };
}

export function unzipTextFromBase64(payload) {
  const encoded = normalizeBase64(payload);
  if (!encoded) {
    return '';
  }

  const packed = Buffer.from(encoded, 'base64');

  try {
    return gunzipSync(packed).toString('utf8');
  } catch {
    // Backward compatibility for previous deflateRaw+base64url payloads.
    const normalizedLegacy = String(payload || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalizedLegacy.length % 4)) % 4;
    const paddedLegacy = normalizedLegacy + '='.repeat(padLength);
    const legacyPacked = Buffer.from(paddedLegacy, 'base64');
    return inflateRawSync(legacyPacked).toString('utf8');
  }
}

export function buildZipCommandReply(text) {
  const details = buildZipTextPayloadDetails(text);
  if (!details) {
    return 'Sila isi teks untuk di-zip.\nContoh: .zip Halo dunia';
  }

  return [
    'ZIP Result (gzip+base64)',
    `Original bytes: ${details.originalBytes}`,
    `Gzip bytes: ${details.gzipBytes}`,
    '',
    details.payload,
  ].join('\n');
}

export function buildUnzipCommandReply(payload) {
  const encoded = normalizeBase64(payload);
  if (!encoded) {
    return 'Sila isi data zip text untuk di-unzip.\nContoh: .unzip S8xNVbJScEksSQQA';
  }

  try {
    const text = unzipTextFromBase64(encoded);
    if (!text) {
      return 'Hasil unzip kosong.';
    }

    return ['UNZIP Result', '', text].join('\n');
  } catch {
    return 'Data unzip tidak sah. Pastikan input dijana oleh command zip.';
  }
}

export async function buildZipArchiveBuffer(contentBuffer, entryName = 'attachment.bin') {
  if (!Buffer.isBuffer(contentBuffer) || contentBuffer.length === 0) {
    return null;
  }

  const zip = new JSZip();
  zip.file(normalizeArchiveEntryName(entryName), contentBuffer);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function buildZipMediaCommandReply(contentBuffer, entryName = 'attachment.bin', archiveName = 'attachment.zip') {
  const archiveBuffer = await buildZipArchiveBuffer(contentBuffer, entryName);
  if (!archiveBuffer) {
    return {
      type: 'zip-file',
      document: null,
      fileName: archiveName,
      mimetype: 'application/zip',
    };
  }

  return {
    type: 'zip-file',
    document: archiveBuffer,
    fileName: archiveName,
    mimetype: 'application/zip',
  };
}