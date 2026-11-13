import { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, validCustomAsset, type CustomAsset } from './customStamp';

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 64_000_000;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
export function validatePhotoFile(file: Pick<File, 'size' | 'type' | 'name'>) {
  if (!file.size) throw Error('This image is empty. Choose another photo.');
  if (file.size > MAX_PHOTO_BYTES) throw Error('Choose an image smaller than 20 MB.');
  const supportedType = /^image\/(jpeg|png|webp|heic|heif|heic-sequence|heif-sequence)$/i.test(file.type);
  const unnamedType = !file.type || file.type === 'application/octet-stream';
  if (!supportedType && !(unnamedType && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)))
    throw Error('Choose a JPEG, PNG, WebP or supported HEIC/HEIF image.');
}
export function photoDimensions(width: number, height: number, factor = 1) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > MAX_PHOTO_PIXELS)
    throw Error('This image is too large to process. Choose a photo up to 64 megapixels.');
  const fit = Math.min(1, MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height) * factor;
  return { width: Math.max(1, Math.round(width * fit)), height: Math.max(1, Math.round(height * fit)) };
}
export type DecodedPhoto = { image: HTMLImageElement; url: string; dispose: () => void };
export async function decodePhoto(file: File): Promise<DecodedPhoto> {
  validatePhotoFile(file);
  const url = URL.createObjectURL(file), image = new Image();
  try {
    // Modern HTML image decoding applies EXIF orientation, including mirrored photos.
    // Keep the original File/object URL for preview; never re-encode it on selection.
    image.src = url;
    await image.decode();
    photoDimensions(image.naturalWidth, image.naturalHeight);
    return { image, url, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof Error && error.message.includes('64 megapixels')) throw error;
    throw Error(/hei[cf]/i.test(file.type + file.name)
      ? 'This browser cannot open this HEIC/HEIF photo. Export it as JPEG or PNG and import again.'
      : 'This image could not be opened. Choose another JPEG, PNG or WebP photo.');
  }
}
export async function preparePhoto(image: HTMLImageElement): Promise<CustomAsset> {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw Error('This browser cannot prepare photo stamps.');
  for (let attempt = 0; attempt < 18; attempt++) {
    const size = photoDimensions(image.naturalWidth, image.naturalHeight, .85 ** attempt);
    canvas.width = size.width; canvas.height = size.height;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // drawImage fits the entire oriented source without cropping or an opaque fill.
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const asset = { image_data: canvas.toDataURL('image/png'), image_width: size.width, image_height: size.height };
    if (validCustomAsset(asset)) return asset;
    // Yield between expensive PNG encodes so the phone can paint progress/cancel UI.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw Error('This image could not fit the stamp limit. Choose a smaller photo.');
}
