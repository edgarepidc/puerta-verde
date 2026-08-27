const LOGO_SRC = '/brand/logo.png';
const MAX_WIDTH = 168;
const MAX_HEIGHT = 120;
/** 58 mm paper at 203 dpi. Full-width raster so the mark stays centered even without ESC a. */
const PAPER_DOTS = 384;
const ALPHA_MIN = 24;
const WHITE_LUMA = 245;

let cached: number[] | null = null;
let pending: Promise<number[]> | null = null;

export function encodeMonochromeRaster(width: number, height: number, bits: Uint8Array): number[] {
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  const header = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH];
  const payload = new Array<number>(header.length + bits.length);
  for (let i = 0; i < header.length; i++) payload[i] = header[i];
  for (let i = 0; i < bits.length; i++) payload[header.length + i] = bits[i];
  return payload;
}

function alphaBBox(image: ImageData, minAlpha: number) {
  const { width, height, data } = image;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < minAlpha) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1, y1 };
}

function rasterFromImageData(image: ImageData): Uint8Array {
  const { width, height, data } = image;
  const widthBytes = Math.ceil(width / 8);
  const raster = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const ink = data[i + 3] > ALPHA_MIN && luma < WHITE_LUMA;
      if (!ink) continue;
      raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return raster;
}

async function rasterizeLogo(): Promise<number[]> {
  if (typeof document === 'undefined') return [];

  const img = new Image();
  img.decoding = 'sync';
  img.src = LOGO_SRC;
  await img.decode();

  const source = document.createElement('canvas');
  source.width = img.naturalWidth;
  source.height = img.naturalHeight;
  const sourceCtx = source.getContext('2d');
  if (!sourceCtx) return [];
  sourceCtx.drawImage(img, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, source.width, source.height);
  const box = alphaBBox(sourceData, ALPHA_MIN);
  if (!box) return [];

  const srcW = box.x1 - box.x0 + 1;
  const srcH = box.y1 - box.y0 + 1;
  const scale = Math.min(MAX_WIDTH / srcW, MAX_HEIGHT / srcH);
  const destW = Math.max(8, Math.floor((srcW * scale) / 8) * 8);
  const destH = Math.max(1, Math.round(srcH * (destW / srcW)));

  const dest = document.createElement('canvas');
  dest.width = destW;
  dest.height = destH;
  const destCtx = dest.getContext('2d');
  if (!destCtx) return [];
  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, destW, destH);
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(source, box.x0, box.y0, srcW, srcH, 0, 0, destW, destH);

  const pageW = Math.max(PAPER_DOTS, destW);
  const left = Math.floor((pageW - destW) / 2);
  const page = document.createElement('canvas');
  page.width = pageW;
  page.height = destH;
  const pageCtx = page.getContext('2d');
  if (!pageCtx) return [];
  pageCtx.fillStyle = '#ffffff';
  pageCtx.fillRect(0, 0, pageW, destH);
  pageCtx.drawImage(dest, left, 0);

  const raster = rasterFromImageData(pageCtx.getImageData(0, 0, pageW, destH));
  return encodeMonochromeRaster(pageW, destH, raster);
}

/** ESC/POS GS v 0 payload for the brand mark, or empty if it cannot be prepared. */
export async function getEscPosLogo(): Promise<number[]> {
  if (cached) return cached;
  if (pending) return pending;
  pending = rasterizeLogo()
    .then((bytes) => {
      cached = bytes;
      return bytes;
    })
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}
