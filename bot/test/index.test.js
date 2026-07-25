import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { unzipTextFromBase64 } from '../src/zip.js';
import { buildTtsAudioMessage, executeCommand, normalizePhoneNumber } from '../src/index.js';

test('accepts dot-prefixed numeric location commands', async () => {
  const reply = await executeCommand('.33', {
    commandPrefix: '!',
    http: {
      async get() {
        return {
          data: {
            success: true,
            data: [
              {
                code: 'R1',
                name: 'Route 1',
                shift: 'AM',
                deliveryPoints: [
                  {
                    code: '33',
                    name: 'Stop 33',
                  },
                ],
              },
            ],
          },
        };
      },
    },
  });

  assert.equal(reply.type, 'location');
  assert.equal(reply.point.code, '33');
});

test('builds tts audio payload', () => {
  const payload = buildTtsAudioMessage(Buffer.from('fake-mp3'));

  assert.equal(payload.mimetype, 'audio/mpeg');
  assert.equal(payload.ptt, false);
  assert.ok(Buffer.isBuffer(payload.audio));
});

test('normalizes phone numbers for pairing', () => {
  assert.equal(normalizePhoneNumber('+60 12-345 6789'), '60123456789');
});

test('zip command can read quoted chat text', async () => {
  const reply = await executeCommand('.zip', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  }, {
    extendedTextMessage: {
      contextInfo: {
        quotedMessage: {
          conversation: 'Halo dunia dari reply',
        },
      },
    },
  });

  assert.equal(reply.type, 'zip-text');
  assert.equal(unzipTextFromBase64(reply.payload), 'Halo dunia dari reply');
});

test('zip command can read quoted media caption', async () => {
  const reply = await executeCommand('.zip', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  }, {
    imageMessage: {
      contextInfo: {
        quotedMessage: {
          imageMessage: {
            caption: 'Teks dari media',
          },
        },
      },
    },
  });

  assert.equal(reply.type, 'zip-text');
  assert.equal(unzipTextFromBase64(reply.payload), 'Teks dari media');
});

test('grid command combines current image with quoted image', async () => {
  const firstImage = await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  }).jpeg().toBuffer();

  const secondImage = await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  }).jpeg().toBuffer();

  const reply = await executeCommand('.grid', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async downloadQuotedMediaBuffer(media) {
      if (media?.url === 'quoted-image') return firstImage;
      if (media?.url === 'current-image') return secondImage;
      return null;
    },
  }, {
    imageMessage: {
      caption: '.grid',
      url: 'current-image',
      contextInfo: {
        quotedMessage: {
          imageMessage: {
            url: 'quoted-image',
          },
        },
      },
    },
  });

  assert.equal(reply.type, 'image-grid');
  assert.ok(Buffer.isBuffer(reply.imageBuffer));
  assert.equal(reply.mimetype, 'image/jpeg');

  const meta = await sharp(reply.imageBuffer).metadata();
  assert.equal(meta.width, 1440);
  assert.equal(meta.height, 720);
});

test('grid command asks to reply first image when quoted image is missing', async () => {
  const reply = await executeCommand('.grid', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  }, {
    imageMessage: {
      caption: '.grid',
      url: 'current-image',
    },
  });

  assert.match(String(reply), /reply satu gambar/i);
});

test('sticker command asks to reply media when no quoted media', async () => {
  const reply = await executeCommand('.sticker', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async buildStickerCommandReply() {
      throw new Error('should not be called');
    },
  });

  assert.match(reply, /Reply gambar\/video/i);
});

test('sticker command passes nobg flag to sticker builder', async () => {
  const calls = [];
  const reply = await executeCommand('.sticker nobg', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async buildStickerCommandReply(mediaBuffer, options) {
      calls.push({ mediaBuffer, options });
      return {
        type: 'sticker',
        stickerBuffer: Buffer.from('fake-webp'),
      };
    },
    async downloadQuotedMediaBuffer() {
      return Buffer.from('fake-image');
    },
  }, {
    extendedTextMessage: {
      contextInfo: {
        quotedMessage: {
          imageMessage: {
            url: 'https://example.com/photo.jpg',
          },
        },
      },
    },
  });

  assert.equal(reply.type, 'sticker');
  assert.ok(Buffer.isBuffer(reply.stickerBuffer));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.mediaType, 'image');
  assert.equal(calls[0].options.removeBackground, true);
});

test('vv command returns a media payload from a view-once image message', async () => {
  const reply = await executeCommand('.vv', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async downloadQuotedMediaBuffer(media, mediaType) {
      assert.equal(mediaType, 'image');
      return Buffer.from('view-once-image');
    },
  }, {
    imageMessage: {
      viewOnce: true,
      url: 'https://example.com/photo.jpg',
    },
  });

  assert.equal(reply.type, 'view-once');
  assert.equal(reply.mediaType, 'image');
  assert.ok(Buffer.isBuffer(reply.mediaBuffer));
  assert.equal(reply.mediaBuffer.toString('utf8'), 'view-once-image');
});

test('vv command carries an optional caption text', async () => {
  const reply = await executeCommand('.vv caption contoh', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async downloadQuotedMediaBuffer() {
      return Buffer.from('view-once-image');
    },
  }, {
    imageMessage: {
      viewOnce: true,
      url: 'https://example.com/photo.jpg',
    },
  });

  assert.equal(reply.type, 'view-once');
  assert.equal(reply.caption, 'caption contoh');
});

test('qr command returns a high-quality qr image payload', async () => {
  const reply = await executeCommand('.qr hello world', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'qrcode');
  assert.ok(Buffer.isBuffer(reply.imageBuffer));
  assert.equal(reply.mimetype, 'image/png');
  assert.equal(reply.caption, 'hello world');
});

test('ss command returns a screenshot image payload', async () => {
  const calls = [];
  const reply = await executeCommand('.ss example.com', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
    async fetchScreenshotBuffer(targetUrl, options) {
      calls.push({ targetUrl, options });
      return Buffer.from('fake-screenshot');
    },
  });

  assert.equal(reply.type, 'screenshot');
  assert.ok(Buffer.isBuffer(reply.imageBuffer));
  assert.equal(reply.imageBuffer.toString('utf8'), 'fake-screenshot');
  assert.equal(reply.caption, 'https://example.com/');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].targetUrl, 'https://example.com/');
});

test('ss command rejects missing link', async () => {
  const reply = await executeCommand('.ss', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'screenshot');
  assert.equal(reply.imageBuffer, null);
  assert.match(reply.caption, /Sila isi link/i);
});

test('txt command returns a text document payload', async () => {
  const reply = await executeCommand('.txt hello world', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'document');
  assert.ok(Buffer.isBuffer(reply.document));
  assert.equal(reply.fileName, 'document.txt');
  assert.equal(reply.mimetype, 'text/plain');
});

test('pdf command returns a pdf document payload', async () => {
  const reply = await executeCommand('.pdf hello world', {
    commandPrefix: '.',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'document');
  assert.ok(Buffer.isBuffer(reply.document));
  assert.equal(reply.fileName, 'document.pdf');
  assert.equal(reply.mimetype, 'application/pdf');
});

test('unknown command returns command-not-found payload with shared web link', async () => {
  const reply = await executeCommand('.doesnotexist test', {
    commandPrefix: '.',
    appBaseUrl: 'https://routebot.example.com',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'command-not-found');
  assert.equal(reply.commandPrefix, '.');
  assert.equal(reply.openInWebUrl, 'https://routebot.example.com/#page=bot-command&shared=bot-command');
  assert.match(reply.text, /Command not found\./i);
});

test('unknown command shared web link keeps subpath and opens hash page correctly', async () => {
  const reply = await executeCommand('.doesnotexist test', {
    commandPrefix: '.',
    appBaseUrl: 'https://routebot.example.com/app',
    http: {
      async get() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(reply.type, 'command-not-found');
  assert.equal(reply.openInWebUrl, 'https://routebot.example.com/app/#page=bot-command&shared=bot-command');
  assert.equal(
    reply.text,
    ['Command not found.', '', 'Klik button di bawah untuk lihat semua command:'].join('\n'),
  );
});