import cloudinary from '../config/cloudinary.js';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_REQUEST = 5;
export const DEFAULT_PHOTO_FOLDER = 'Afro-centric/photos';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

export function validateImageBuffer(file) {
  const buffer = Buffer.isBuffer(file) ? file : file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('A non-empty image file is required.');
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    const error = new Error('Image exceeds the 10MB upload limit.');
    error.statusCode = 413;
    throw error;
  }

  const format = detectImageFormat(buffer);
  if (!format) {
    const error = new Error('Unsupported image content. Only JPEG, PNG, and WebP are allowed.');
    error.statusCode = 415;
    throw error;
  }

  const mimeType = typeof file?.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
  if (mimeType && (!acceptedMimeTypes.has(mimeType)
      || (mimeType !== `image/${format}` && !(format === 'jpeg' && mimeType === 'image/jpg')))) {
    const error = new Error('Image content does not match its declared media type.');
    error.statusCode = 415;
    throw error;
  }

  return { format, size: buffer.length };
}

function ensureCloudinaryConfigured() {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };

  if (Object.values(config).some((value) => !value)) {
    const error = new Error('Cloudinary is not configured.');
    error.statusCode = 503;
    throw error;
  }

  cloudinary.config(config);
}

export async function uploadImage(file, { folder = DEFAULT_PHOTO_FOLDER } = {}) {
  const { format } = validateImageBuffer(file);
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', overwrite: false },
      (error, result) => {
        if (error) {
          const uploadError = new Error('Cloudinary image upload failed.');
          uploadError.statusCode = 503;
          uploadError.cause = error;
          reject(uploadError);
          return;
        }

        if (!result?.secure_url || !result.public_id) {
          const resultError = new Error('Cloudinary returned an incomplete image result.');
          resultError.statusCode = 503;
          reject(resultError);
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format ?? format,
        });
      },
    );

    stream.end(file.buffer);
  });
}

export async function deleteImage(publicId) {
  if (typeof publicId !== 'string' || publicId.length === 0) {
    const error = new Error('A Cloudinary public ID is required.');
    error.statusCode = 400;
    throw error;
  }

  ensureCloudinaryConfigured();
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result?.result === 'ok' || result?.result === 'not found') {
      return result;
    }

    const error = new Error('Cloudinary did not confirm image deletion.');
    error.statusCode = 503;
    throw error;
  } catch (cause) {
    if (cause.statusCode) {
      throw cause;
    }

    const error = new Error('Cloudinary image deletion failed.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}

export default { uploadImage, deleteImage, detectImageFormat, validateImageBuffer };
