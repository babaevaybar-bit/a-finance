/**
 * Сжимает фото перед загрузкой: длинная сторона не больше maxSide, JPEG.
 * Фото с телефона 3–8 МБ превращается примерно в 100–400 КБ.
 * Если браузер не умеет открыть файл (например, HEIC в Chrome на Windows) — возвращает null.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('decode'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return null;
      const k = Math.min(1, maxSide / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';               // прозрачный PNG → белый фон, а не чёрный
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', quality));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
