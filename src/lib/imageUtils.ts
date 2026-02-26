/**
 * Client-side image utilities for the property photo system.
 * Converts images to WebP format and resizes large images to save storage.
 */

export async function convertToWebP(
  file: File,
  maxWidth = 1920,
  quality = 0.85
): Promise<File> {
  // Skip conversion if already a small WebP
  if (file.type === "image/webp" && file.size < 500_000) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Resize if wider than maxWidth (preserve aspect ratio)
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("WebP conversion failed"));
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(
            new File([blob], `${baseName}.webp`, { type: "image/webp" })
          );
        },
        "image/webp",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };

    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    // Clean up the object URL after the image loads
    const origOnload = img.onload;
    img.onload = function (e) {
      URL.revokeObjectURL(objectUrl);
      if (origOnload) (origOnload as EventListener).call(this, e);
    };
  });
}
