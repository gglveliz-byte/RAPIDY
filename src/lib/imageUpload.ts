const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 1_800_000;

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("La imagen no es válida"));
    image.src = src;
  });
}

/**
 * Convierte una imagen a data URL comprimida.
 * - Rechaza archivos que no sean imágenes.
 * - Limita la entrada a 8 MB.
 * - Redimensiona y comprime para que el base64 no infle la base de datos.
 */
export async function fileToCompressedDataUrl(
  file: File,
  options: CompressImageOptions = {},
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona una imagen JPG, PNG o WEBP");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("La imagen supera el máximo de 8 MB");
  }

  const original = await readFileAsDataURL(file);
  if (original.length <= MAX_OUTPUT_CHARS && file.size <= 500 * 1024) {
    return original;
  }

  const image = await loadImage(original);
  const maxWidth = options.maxWidth ?? 1200;
  const maxHeight = options.maxHeight ?? 1200;
  const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen");
  context.drawImage(image, 0, 0, width, height);

  let quality = options.quality ?? 0.82;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > MAX_OUTPUT_CHARS && quality > 0.4) {
    quality -= 0.1;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  if (output.length > MAX_OUTPUT_CHARS) {
    throw new Error("La imagen sigue siendo demasiado grande; usa una más pequeña");
  }
  return output;
}