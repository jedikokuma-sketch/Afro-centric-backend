const cloudinary = require('cloudinary').v2;

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_FOLDER = 'afrolens/photos';
const ACCEPTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function configureCloudinary() {
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };

  if (config.cloud_name && config.api_key && config.api_secret) {
    cloudinary.config(config);
  }
}

configureCloudinary();

function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

function validateImageBuffer(file) {
  if (!file || !Buffer.isBuffer(file.buffer || file)) {
    throw Object.assign(new Error('A valid uploaded image is required.'), { statusCode: 400 });
  }

  const buffer = file.buffer || file;
  if (buffer.length === 0) {
    throw Object.assign(new Error('Image file is empty.'), { statusCode: 400 });
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw Object.assign(new Error('Image exceeds the 10MB upload limit.'), { statusCode: 413 });
  }

  const detectedFormat = detectImageFormat(buffer);
  if (!detectedFormat) {
    throw Object.assign(new Error('Unsupported image format. Only JPEG, PNG, and WebP are allowed.'), { statusCode: 415 });
  }

  const mimeType = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
  if (mimeType && !ACCEPTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error('Unsupported image mime type.'), { statusCode: 415 });
  }

  if (mimeType && mimeType !== `image/${detectedFormat}` && !(mimeType === 'image/jpg' && detectedFormat === 'jpeg')) {
    throw Object.assign(new Error('Uploaded file signature does not match its declared type.'), { statusCode: 415 });
  }

  return {
    format: detectedFormat,
    size: buffer.length,
  };
}

async function uploadImage(file, options = {}) {
  if (!file || !file.buffer) {
    throw Object.assign(new Error('An image file is required for upload.'), { statusCode: 400 });
  }

  validateImageBuffer(file);

  const folder = options.folder || DEFAULT_FOLDER;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(Object.assign(new Error('Cloudinary upload failed.'), { statusCode: 503, cause: error }));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
        });
      }
    );

    stream.end(file.buffer);
  });
}

async function deleteImage(publicId) {
  if (!publicId) {
    return { result: 'skipped', reason: 'missing-public-id' };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return result;
  } catch (error) {
    if (error && (error.http_code === 404 || /not found/i.test(error.message || ''))) {
      return { result: 'not_found' };
    }

    throw Object.assign(new Error('Cloudinary asset removal failed.'), {
      statusCode: 503,
      cause: error,
    });
  }
}

module.exports = {
  MAX_IMAGE_SIZE_BYTES,
  DEFAULT_FOLDER,
  validateImageBuffer,
  detectImageFormat,
  uploadImage,
  deleteImage,
};
