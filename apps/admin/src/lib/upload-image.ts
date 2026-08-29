/** Vercel request body limit is ~4.5 MB; stay under that after multipart overhead. */
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function parseApiJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (/payload|too large|entity too large|413/i.test(snippet) || response.status === 413) {
      throw new Error('La imagen es demasiado grande. Prueba con una foto más ligera (máx. ~3 MB).');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.');
    }
    if (response.status >= 500) {
      throw new Error('El servidor no pudo procesar la imagen. Intenta de nuevo en unos segundos.');
    }
    throw new Error(
      snippet
        ? `No se pudo subir la imagen (${response.status}). ${snippet}`
        : `No se pudo subir la imagen (error ${response.status}).`,
    );
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen. Usa JPG, PNG o WEBP.'));
    };
    image.src = url;
  });
}

/** Resize/compress phone photos so uploads fit Vercel limits. */
export async function prepareImageForUpload(file: File): Promise<File> {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
    throw new Error('Este formato (HEIC) no es compatible. En el iPhone elige “Más compatible” o exporta a JPG.');
  }
  if (!type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen válida.');
  }

  // Small enough already and a format we can send as-is
  if (file.size <= MAX_UPLOAD_BYTES && (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp')) {
    return file;
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen en este navegador.');
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('La imagen sigue siendo muy grande. Usa una foto más pequeña o de menor resolución.');
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'producto';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export async function uploadProductMedia(file: File, bucket: 'product-media' | 'promo-media' = 'product-media') {
  const prepared = await prepareImageForUpload(file);
  const formData = new FormData();
  formData.append('file', prepared);
  formData.append('bucket', bucket);
  const response = await fetch('/api/products/upload', { method: 'POST', body: formData });
  const payload = await parseApiJson<{ url?: string; error?: string }>(response);
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo subir la imagen');
  if (!payload.url) throw new Error('La subida no devolvió una URL de imagen.');
  return payload.url;
}
