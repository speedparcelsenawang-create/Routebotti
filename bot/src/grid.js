import sharp from 'sharp';

const CELL_SIZE = 720;

async function normalizeImageForGrid(imageBuffer) {
  return sharp(imageBuffer)
    .rotate()
    .resize(CELL_SIZE, CELL_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function buildImageGridCommandReply(firstImageBuffer, secondImageBuffer) {
  if (!Buffer.isBuffer(firstImageBuffer) || !Buffer.isBuffer(secondImageBuffer)) {
    return {
      type: 'image-grid',
      imageBuffer: null,
      mimetype: 'image/jpeg',
      caption: 'Dua gambar diperlukan untuk buat grid.',
    };
  }

  try {
    const [leftImage, rightImage] = await Promise.all([
      normalizeImageForGrid(firstImageBuffer),
      normalizeImageForGrid(secondImageBuffer),
    ]);

    const output = await sharp({
      create: {
        width: CELL_SIZE * 2,
        height: CELL_SIZE,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .composite([
        { input: leftImage, top: 0, left: 0 },
        { input: rightImage, top: 0, left: CELL_SIZE },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    return {
      type: 'image-grid',
      imageBuffer: output,
      mimetype: 'image/jpeg',
      caption: 'Grid 2 gambar siap.',
    };
  } catch {
    return {
      type: 'image-grid',
      imageBuffer: null,
      mimetype: 'image/jpeg',
      caption: 'Gagal proses grid gambar.',
    };
  }
}
