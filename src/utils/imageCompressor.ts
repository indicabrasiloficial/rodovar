/**
 * Utility for client-side image compression using native HTML5 Canvas.
 * - Resizes images exceeding 1600px on the longest dimension
 * - Re-exports images to JPEG at ~75% quality (0.75)
 * - PDFs and non-image files are passed through without modification
 */

export interface CompressedFileResult {
  dataUrl: string;
  fileName: string;
  sizeKb: number;
}

export async function processAndCompressFile(
  file: File,
  maxDimension = 1600,
  quality = 0.75
): Promise<CompressedFileResult> {
  const fileName = file.name;

  // PDF or non-image files bypass canvas compression
  if (file.type === 'application/pdf' || !file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve({
          dataUrl: result,
          fileName,
          sizeKb: Math.round(file.size / 1024),
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Compress image using HTML5 Canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context failed to initialize'));
        return;
      }

      // Draw solid white background for transparent PNG/WebP conversions
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const stringLength = compressedDataUrl.length - 'data:image/jpeg;base64,'.length;
      const sizeKb = Math.round((stringLength * 3) / 4 / 1024);

      resolve({
        dataUrl: compressedDataUrl,
        fileName: fileName.replace(/\.[^/.]+$/, '.jpg'),
        sizeKb,
      });
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
