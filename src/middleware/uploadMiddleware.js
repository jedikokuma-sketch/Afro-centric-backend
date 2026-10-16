import multer from 'multer';
import {
  MAX_PHOTOS_PER_REQUEST,
  validateImageBuffer,
} from '../services/cloudinaryService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: MAX_PHOTOS_PER_REQUEST,
  },
});

export function requirePhotoUser(req, res, next) {
  if (!req.user?._id) {
    const error = new Error('Authentication is required.');
    error.statusCode = 401;
    return next(error);
  }
  return next();
}

export function uploadImages(req, res, next) {
  upload.array('image', MAX_PHOTOS_PER_REQUEST)(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      error.statusCode = 413;
      error.message = 'Image exceeds the 10MB upload limit.';
    } else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      error.statusCode = 400;
      error.message = `Upload no more than ${MAX_PHOTOS_PER_REQUEST} files in the "image" field.`;
    }

    return next(error);
  });
}

export function validateUploadedImage(req, res, next) {
  try {
    if (!Array.isArray(req.files) || req.files.length === 0) {
      const error = new Error('At least one image is required in the "image" field.');
      error.statusCode = 400;
      throw error;
    }

    req.files.forEach(validateImageBuffer);
    return next();
  } catch (error) {
    return next(error);
  }
}
