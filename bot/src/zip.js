import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { gunzipSync, inflateRawSync, deflateRawSync } from 'node:zlib';

function normalizeBase64(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function toBase64Url(base64) {
  return String(base64 || '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padLength);
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

  // Use raw deflate + base64url to keep payload shorter than gzip+base64.
  const packed = deflateRawSync(Buffer.from(input, 'utf8'));
  return toBase64Url(packed.toString('base64'));
}

export function unzipTextFromBase64(payload) {
  const encoded = normalizeBase64(payload);
  if (!encoded) {
    return '';
  }

  const packed = Buffer.from(fromBase64Url(encoded), 'base64');

  try {
    return inflateRawSync(packed).toString('utf8');
  } catch {
    // Backward compatibility for previous gzip+base64 payloads.
    return gunzipSync(packed).toString('utf8');
  }
}

export function buildZipCommandReply(text) {
  const input = String(text || '').trim();
  if (!input) {
    return 'Sila isi teks untuk di-zip.\nContoh: .zip Halo dunia';
  }

  const encoded = zipTextToBase64(input);
  return ['ZIP', encoded].join('\n');
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