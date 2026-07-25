import sharp from 'sharp';

const CELL_SIZE = 720;
const GRID_LINES = 3;
const GRID_LINE_WIDTH = 6;
const GRID_LINE_COLOR = { r: 255, g: 255, b: 255, alpha: 0.72 };

async function normalizeImageForGrid(imageBuffer) {
  return sharp(imageBuffer)
    .rotate()
    .resize(CELL_SIZE, CELL_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function createGridOverlaySvg(size = CELL_SIZE) {
  const safeSize = Math.max(100, Number(size) || CELL_SIZE);
  const step = safeSize / GRID_LINES;

  const lines = [];
  for (let i = 1; i < GRID_LINES; i += 1) {
    const position = Math.round(step * i);
    lines.push(`<line x1="${position}" y1="0" x2="${position}" y2="${safeSize}"/>`);
    lines.push(`<line x1="0" y1="${position}" x2="${safeSize}" y2="${position}"/>`);
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${safeSize} ${safeSize}">`
      + `<g stroke="rgba(${GRID_LINE_COLOR.r},${GRID_LINE_COLOR.g},${GRID_LINE_COLOR.b},${GRID_LINE_COLOR.alpha})" stroke-width="${GRID_LINE_WIDTH}">`
      + `${lines.join('')}`
      + '</g>'
      + '</svg>',
    'utf8',
  );
}

export async function buildImageGridCommandReply(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer)) {
    return {
      type: 'image-grid',
      imageBuffer: null,
      mimetype: 'image/jpeg',
      caption: 'Sila hantar satu gambar bersama caption .grid.',
    };
  }

  try {
    const normalizedImage = await normalizeImageForGrid(imageBuffer);
    const gridOverlay = createGridOverlaySvg(CELL_SIZE);

    const output = await sharp(normalizedImage)
      .composite([{ input: gridOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return {
      type: 'image-grid',
      imageBuffer: output,
      mimetype: 'image/jpeg',
      caption: undefined,
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
